// Baixa de estoque das vendas do Acerto (tela Produtos).
//
// O servidor sobe em memória (TURSO_DATABASE_URL=':memory:'), nunca contra o
// banco real: uma checagem no topo recusa rodar se o cliente já enxergar a
// tabela "produtos" — e nada é gravado antes dessa checagem.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { baixarEstoqueItem, gerarEstornosItens, liquidarEstoqueLive } from '../server/stock';

process.env.TURSO_DATABASE_URL = ':memory:';
process.env.TURSO_AUTH_TOKEN = '';

const { getDb } = await import('../server/db');
const { apiRouter } = await import('../server/routes');

const db = getDb();

// Proteção: se por algum motivo o .env prevalecer, paramos aqui (sem gravar).
const tabelaProdutos = await db.execute({
  sql: `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'produtos'`,
  args: [],
});
if (tabelaProdutos.rows.length > 0) {
  throw new Error('Testes recusados: o cliente já enxerga a tabela "produtos" (banco real?).');
}

const dirScripts = path.resolve(process.cwd(), 'scripts');
await db.executeMultiple(fs.readFileSync(path.join(dirScripts, 'schema.sql'), 'utf8'));
await db.executeMultiple(fs.readFileSync(path.join(dirScripts, 'trigger.sql'), 'utf8'));

// ---- servidor em memória -------------------------------------------------

const app = express();
app.use(express.json());
app.use('/api', apiRouter);
const servidor = app.listen(0);
await new Promise<void>((resolve) => servidor.once('listening', () => resolve()));
const porta = (servidor.address() as { port: number }).port;
const baseUrl = `http://127.0.0.1:${porta}/api`;

after(() => {
  servidor.close();
});

// ---- utilitários ---------------------------------------------------------

async function req(
  caminho: string,
  init?: RequestInit
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${caminho}`, init);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

function json(metodo: string, dados: unknown): RequestInit {
  return {
    method: metodo,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(dados),
  };
}

async function criarProduto(ref: string, estoque: number): Promise<void> {
  await db.execute({
    sql: `INSERT INTO produtos
            (id, referencia, descricao, preco_venda, estoque_atual, custo, lucro,
             lucro_percentual, estoque_minimo, fornecedor)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [`prod-${ref}`, ref, `Produto ${ref}`, 12.5, estoque, 5, 7.5, 60, 3, `Forn ${ref}`],
  });
}

async function criarVenda(clienteId: number, dataLive: string): Promise<number> {
  await db.execute({
    sql: `INSERT INTO live_clientes (id, username, nome_completo) VALUES (?, ?, ?)
          ON CONFLICT(id) DO NOTHING`,
    args: [clienteId, `cliente-${clienteId}`, `Cliente ${clienteId}`],
  });
  const r = await db.execute({
    sql: `INSERT INTO live_vendas (cliente_id, data_live, pago) VALUES (?, ?, 0) RETURNING id`,
    args: [clienteId, dataLive],
  });
  return Number((r.rows[0] as Record<string, unknown>).id);
}

async function produtoPorRef(ref: string): Promise<Record<string, any> | null> {
  const r = await db.execute({
    sql: 'SELECT * FROM produtos WHERE referencia = ?',
    args: [ref],
  });
  return r.rows.length > 0 ? (r.rows[0] as Record<string, any>) : null;
}

async function estoqueDe(ref: string): Promise<number> {
  const p = await produtoPorRef(ref);
  return p ? Number(p.estoque_atual) : NaN;
}

// ---- testes --------------------------------------------------------------

test('venda lançada no Acerto dá baixa no estoque e preserva os demais campos de produtos', async () => {
  await criarProduto('T100', 10);
  const vendaId = await criarVenda(910001, '2026-11-04');

  const { status, body } = await req(
    '/itens',
    json('POST', { venda_id: vendaId, referencia: 'T100', preco: 12.5, quantidade: 3 })
  );

  assert.equal(status, 200);
  assert.ok(body.id, 'a rota devolve o id do item criado');
  assert.equal(await estoqueDe('T100'), 7, 'estoque deve ser baixado em 3 unidades');

  // os demais campos da tabela produtos ficam intactos
  const p = await produtoPorRef('T100');
  assert.equal(p?.preco_venda, 12.5);
  assert.equal(p?.descricao, 'Produto T100');
  assert.equal(p?.custo, 5);
  assert.equal(p?.lucro, 7.5);
  assert.equal(p?.lucro_percentual, 60);
  assert.equal(p?.estoque_minimo, 3);
  assert.equal(p?.fornecedor, 'Forn T100');

  // auditoria: movimentação de SAÍDA vinculada ao item
  const mov = await db.execute({
    sql: `SELECT tipo, quantidade, origem_id FROM movimentacoes_estoque
          WHERE origem_id = ?`,
    args: [String(body.id)],
  });
  assert.equal(mov.rows.length, 1);
  assert.equal(String(mov.rows[0].tipo), 'SAÍDA');
  assert.equal(Number(mov.rows[0].quantidade), 3);
});

test('alterar a quantidade do item move o estoque apenas pela diferença', async () => {
  await criarProduto('T110', 10);
  const vendaId = await criarVenda(910002, '2026-11-05');

  const criado = await req(
    '/itens',
    json('POST', { venda_id: vendaId, referencia: 'T110', preco: 12.5, quantidade: 3 })
  );
  assert.equal(await estoqueDe('T110'), 7);

  // 3 → 5: baixa mais 2
  await req(`/itens/${criado.body.id}`, json('PATCH', { quantidade: 5 }));
  assert.equal(await estoqueDe('T110'), 5);

  // 5 → 2: devolve 3
  await req(`/itens/${criado.body.id}`, json('PATCH', { quantidade: 2 }));
  assert.equal(await estoqueDe('T110'), 8);
});

test('excluir o item devolve ao estoque o que foi baixado', async () => {
  await criarProduto('T120', 10);
  const vendaId = await criarVenda(910003, '2026-11-06');

  const criado = await req(
    '/itens',
    json('POST', { venda_id: vendaId, referencia: 'T120', preco: 12.5, quantidade: 4 })
  );
  assert.equal(await estoqueDe('T120'), 6);

  const removido = await req(`/itens/${criado.body.id}`, { method: 'DELETE' });
  assert.equal(removido.status, 200);
  assert.equal(await estoqueDe('T120'), 10, 'estoque deve voltar ao original');
});

test('item antigo, sem movimentação vinculada, não sofre estorno ao ser excluído', async () => {
  await criarProduto('T130', 10);
  const vendaId = await criarVenda(910004, '2026-11-07');

  // inserido direto no banco (como eram as vendas antes deste recurso)
  const r = await db.execute({
    sql: `INSERT INTO live_vendas_itens (venda_id, referencia, preco, quantidade)
          VALUES (?, ?, ?, ?) RETURNING id`,
    args: [vendaId, 'T130', 12.5, 2],
  });
  const idAntigo = Number((r.rows[0] as Record<string, unknown>).id);
  assert.equal(await estoqueDe('T130'), 10, 'nenhuma baixa foi registrada para ele');

  const removido = await req(`/itens/${idAntigo}`, { method: 'DELETE' });
  assert.equal(removido.status, 200);
  assert.equal(await estoqueDe('T130'), 10, 'sem movimentação não há o que devolver');
});

test('excluir vendas pendentes devolve o estoque das sacolas não pagas', async () => {
  await criarProduto('T140', 10);
  const vendaId = await criarVenda(910005, '2026-11-08');

  await req(
    '/itens',
    json('POST', { venda_id: vendaId, referencia: 'T140', preco: 12.5, quantidade: 4 })
  );
  assert.equal(await estoqueDe('T140'), 6);

  const removido = await req('/vendas/pendentes?data_live=2026-11-08', { method: 'DELETE' });
  assert.equal(removido.status, 200);
  assert.equal(await estoqueDe('T140'), 10, 'sacola não paga não pode consumir estoque');
});

test('liquidar a live baixa só o que falta e impede baixa dupla na finalização', async () => {
  await criarProduto('T150', 10);
  const vendaId = await criarVenda(910006, '2026-11-09');

  // item lançado agora: baixa imediata de 2
  const lancado = await req(
    '/itens',
    json('POST', { venda_id: vendaId, referencia: 'T150', preco: 12.5, quantidade: 2 })
  );
  assert.equal(await estoqueDe('T150'), 8);

  // item antigo da mesma live, sem movimentação: nada foi baixado ainda
  const antigo = await db.execute({
    sql: `INSERT INTO live_vendas_itens (venda_id, referencia, preco, quantidade)
          VALUES (?, ?, ?, ?) RETURNING id`,
    args: [vendaId, 'T150', 12.5, 3],
  });
  const idAntigo = Number((antigo.rows[0] as Record<string, unknown>).id);

  const resultado = await liquidarEstoqueLive(db, '2026-11-09', [
    { id: lancado.body.id, referencia: 'T150', quantidade: 2 },
    { id: idAntigo, referencia: 'T150', quantidade: 3 },
  ]);

  assert.equal(resultado.itens, 2);
  assert.equal(resultado.ajustes, 1, 'só o item antigo precisa de ajuste');
  assert.equal(await estoqueDe('T150'), 5, '8 - 3 (item antigo) = 5, sem baixa dupla do item novo');

  // a limpeza da live apaga os itens: as movimentações foram desvinculadas,
  // então nada é estornado e a venda paga continua descontada
  await req('/itens/vendas?ids=' + vendaId, { method: 'DELETE' });
  assert.equal(await estoqueDe('T150'), 5, 'finalizar não pode estornar venda paga');
});

test('referência inexistente no catálogo não quebra o lançamento da venda', async () => {
  const vendaId = await criarVenda(910007, '2026-11-10');

  const { status, body } = await req(
    '/itens',
    json('POST', { venda_id: vendaId, referencia: 'NAO-EXISTE', preco: 10, quantidade: 1 })
  );

  assert.equal(status, 200);
  assert.ok(body.id, 'a venda é registrada mesmo assim');
  const mov = await db.execute({
    sql: 'SELECT count(*) AS c FROM movimentacoes_estoque WHERE origem_id = ?',
    args: [String(body.id)],
  });
  assert.equal(Number(mov.rows[0].c), 0, 'sem produto não há estoque a mexer');
});

test('gerarEstornosItens não devolve estoque para item desconhecido', async () => {
  const stmts = await gerarEstornosItens(db, [999999, '']);
  assert.equal(stmts.length, 0);
});

test('baixarEstoqueItem ignora quantidade zero e referência vazia', async () => {
  await criarProduto('T160', 10);
  assert.equal(await baixarEstoqueItem(db, { itemId: 1, referencia: 'T160', quantidade: 0 }), false);
  assert.equal(await baixarEstoqueItem(db, { itemId: 1, referencia: '   ', quantidade: 5 }), false);
  assert.equal(await estoqueDe('T160'), 10);
});

// Reproduz, com os dados que a tela lê (GET /produtos), os cálculos do
// dashboard: SKUs, Unidades, Valor a Custo e Potencial de Venda.
async function lerDashboard() {
  const { body } = await req('/produtos');
  const produtos = body as Record<string, any>[];
  return {
    totalSkus: produtos.length,
    unidades: produtos.reduce((a, p) => a + (Number(p.estoque_atual) || 0), 0),
    valorCusto: produtos.reduce((a, p) => a + (Number(p.estoque_atual) || 0) * (Number(p.custo) || 0), 0),
    valorVenda: produtos.reduce((a, p) => a + (Number(p.estoque_atual) || 0) * (Number(p.preco_venda) || 0), 0),
  };
}

const igual = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `esperava ${b}, veio ${a}`);

test('dashboard reflete a saída ao vender e a entrada ao remover o item', async () => {
  await criarProduto('T200', 10); // custo 5, venda 12,50
  await criarProduto('T201', 4);
  const vendaId = await criarVenda(910008, '2026-11-11');

  const antes = await lerDashboard();

  // SAÍDA: venda de 3 unidades no Acerto
  const criado = await req(
    '/itens',
    json('POST', { venda_id: vendaId, referencia: 'T200', preco: 12.5, quantidade: 3 })
  );
  const aposVenda = await lerDashboard();
  igual(aposVenda.totalSkus, antes.totalSkus);
  igual(aposVenda.unidades, antes.unidades - 3);
  igual(aposVenda.valorVenda, antes.valorVenda - 3 * 12.5);
  igual(aposVenda.valorCusto, antes.valorCusto - 3 * 5);
  assert.equal(await estoqueDe('T200'), 7);

  // ENTRADA: remover o item devolve a mercadoria ao estoque
  await req(`/itens/${criado.body.id}`, { method: 'DELETE' });
  const aposRemocao = await lerDashboard();
  assert.deepEqual(aposRemocao, antes, 'todos os valores do dashboard voltam ao original');
  assert.equal(await estoqueDe('T200'), 10);
});
