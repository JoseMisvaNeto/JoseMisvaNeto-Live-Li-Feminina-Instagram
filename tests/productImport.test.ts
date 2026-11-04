import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import {
  executarImportacao,
  planProductImport,
  validarLinhasImportacao,
  type ProductImportRow,
} from '../server/productImport';

const schemaSql = fs.readFileSync(path.join(process.cwd(), 'scripts', 'schema.sql'), 'utf8');
const triggerSql = fs.readFileSync(path.join(process.cwd(), 'scripts', 'trigger.sql'), 'utf8');

const TOP: ProductImportRow = {
  referencia: '306',
  descricao: 'Top com e sem bojo removível (modelos variados)',
  quantidade: 10,
  valor_unitario: 88.9,
};

async function novoBanco(): Promise<Client> {
  const db = createClient({ url: ':memory:' });
  await db.executeMultiple(schemaSql);
  await db.executeMultiple(triggerSql);
  return db;
}

async function inserirProduto(
  db: Client,
  dados: { id: string; referencia: string; descricao: string; preco?: number; custo?: number; estoque?: number }
) {
  await db.execute({
    sql: `INSERT INTO produtos (id, referencia, descricao, preco_venda, estoque_atual, custo, lucro, lucro_percentual, estoque_minimo, data_cadastro)
          VALUES (?, ?, ?, ?, ?, ?, 0, 0, 5, datetime('now'))`,
    args: [
      dados.id,
      dados.referencia,
      dados.descricao,
      dados.preco ?? 0,
      dados.estoque ?? 0,
      dados.custo ?? 0,
    ],
  });
}

async function produtoPorRef(db: Client, referencia: string) {
  const r = await db.execute({
    sql: 'SELECT * FROM produtos WHERE referencia = ?',
    args: [referencia],
  });
  assert.equal(r.rows.length, 1, `produto ${referencia} deveria existir uma única vez`);
  return r.rows[0];
}

async function contarMovimentacoes(db: Client): Promise<number> {
  const r = await db.execute({ sql: 'SELECT count(*) AS c FROM movimentacoes_estoque', args: [] });
  return Number(r.rows[0].c);
}

test('cadastra produto novo com estoque inicial via movimentação de entrada', async () => {
  const db = await novoBanco();
  const resultado = await executarImportacao(db, [TOP], 'cadastro');

  assert.equal(resultado.criados, 1);
  assert.equal(resultado.atualizados, 0);
  assert.equal(resultado.unidades, 10);
  assert.equal(resultado.movimentacoes, 1);

  const produto = await produtoPorRef(db, '306');
  assert.equal(Number(produto.estoque_atual), 10);
  assert.equal(Number(produto.preco_venda), 88.9);
  assert.equal(Number(produto.lucro), 88.9);
  assert.equal(String(produto.descricao), TOP.descricao);

  const mov = await db.execute({ sql: 'SELECT tipo, quantidade FROM movimentacoes_estoque', args: [] });
  assert.equal(mov.rows.length, 1);
  assert.equal(String(mov.rows[0].tipo), 'ENTRADA');
  assert.equal(Number(mov.rows[0].quantidade), 10);
});

test('modo cadastro atualiza descrição/preço sem alterar o estoque', async () => {
  const db = await novoBanco();
  await inserirProduto(db, {
    id: 'p1',
    referencia: '306',
    descricao: 'Top antigo',
    preco: 50,
    custo: 40,
    estoque: 3,
  });

  const resultado = await executarImportacao(db, [TOP], 'cadastro');

  assert.equal(resultado.criados, 0);
  assert.equal(resultado.atualizados, 1);
  assert.equal(resultado.movimentacoes, 0);

  const produto = await produtoPorRef(db, '306');
  assert.equal(Number(produto.estoque_atual), 3);
  assert.equal(Number(produto.preco_venda), 88.9);
  assert.equal(String(produto.descricao), TOP.descricao);
  assert.equal(Number(produto.lucro), 48.9);
  assert.equal(await contarMovimentacoes(db), 0);

  const produtos = await db.execute({ sql: 'SELECT count(*) AS c FROM produtos', args: [] });
  assert.equal(Number(produtos.rows[0].c), 1);
});

test('modo somar adiciona a quantidade ao estoque existente', async () => {
  const db = await novoBanco();
  await inserirProduto(db, { id: 'p1', referencia: '306', descricao: 'Top', preco: 50, estoque: 3 });

  const resultado = await executarImportacao(db, [TOP], 'somar');

  assert.equal(resultado.movimentacoes, 1);
  const produto = await produtoPorRef(db, '306');
  assert.equal(Number(produto.estoque_atual), 13);

  const mov = await db.execute({ sql: 'SELECT tipo, quantidade FROM movimentacoes_estoque', args: [] });
  assert.equal(String(mov.rows[0].tipo), 'ENTRADA');
  assert.equal(Number(mov.rows[0].quantidade), 10);
});

test('modo substituir define o estoque do CSV (para mais e para menos)', async () => {
  const db = await novoBanco();
  await inserirProduto(db, { id: 'p1', referencia: '306', descricao: 'Top', preco: 50, estoque: 3 });

  await executarImportacao(db, [TOP], 'substituir');
  assert.equal(Number((await produtoPorRef(db, '306')).estoque_atual), 10);

  await executarImportacao(db, [{ ...TOP, quantidade: 4 }], 'substituir');
  assert.equal(Number((await produtoPorRef(db, '306')).estoque_atual), 4);

  const mov = await db.execute({
    sql: 'SELECT tipo, quantidade FROM movimentacoes_estoque ORDER BY rowid',
    args: [],
  });
  assert.equal(mov.rows.length, 2);
  assert.equal(String(mov.rows[0].tipo), 'ENTRADA');
  assert.equal(Number(mov.rows[0].quantidade), 7);
  assert.equal(String(mov.rows[1].tipo), 'SAÍDA');
  assert.equal(Number(mov.rows[1].quantidade), 6);
});

test('reimportar o mesmo arquivo não duplica produtos nem soma estoque', async () => {
  const db = await novoBanco();
  const rows = [
    TOP,
    { referencia: 'A1', descricao: 'Outro produto', quantidade: 5, valor_unitario: 19.9 },
  ];

  await executarImportacao(db, rows, 'cadastro');
  const segundo = await executarImportacao(db, rows, 'cadastro');

  assert.equal(segundo.criados, 0);
  assert.equal(segundo.atualizados, 2);
  assert.equal(segundo.movimentacoes, 0);

  const produtos = await db.execute({ sql: 'SELECT referencia, estoque_atual FROM produtos ORDER BY referencia', args: [] });
  assert.equal(produtos.rows.length, 2);
  assert.equal(Number((await produtoPorRef(db, '306')).estoque_atual), 10);
  assert.equal(Number((await produtoPorRef(db, 'A1')).estoque_atual), 5);
  // só as movimentações iniciais da primeira importação
  assert.equal(await contarMovimentacoes(db), 2);
});

test('não apaga produtos que não estão no CSV e preserva o histórico anterior', async () => {
  const db = await novoBanco();
  await inserirProduto(db, { id: 'antigo', referencia: 'OLD', descricao: 'Fora do CSV' });
  await db.execute({
    sql: `INSERT INTO movimentacoes_estoque (id, produto_id, tipo, quantidade, descricao, data)
          VALUES ('mov-antiga', 'antigo', 'ENTRADA', 2, 'Compra anterior', datetime('now'))`,
    args: [],
  });

  await executarImportacao(db, [TOP], 'cadastro');

  const old = await produtoPorRef(db, 'OLD');
  assert.equal(String(old.descricao), 'Fora do CSV');
  assert.equal(Number(old.estoque_atual), 2);

  const movs = await db.execute({ sql: 'SELECT id FROM movimentacoes_estoque', args: [] });
  assert.equal(movs.rows.length, 2);
  assert.ok(movs.rows.some((m) => String(m.id) === 'mov-antiga'));
});

test('falha na gravação não deixa produtos parciais (batch atômico)', async () => {
  const db = await novoBanco();
  const plano = planProductImport([TOP], [], 'cadastro', 'lote-teste');
  assert.ok(plano.statements.length >= 2);

  await assert.rejects(() =>
    db.batch(
      [
        ...plano.statements,
        // referência obrigatória nula: força erro no meio do lote
        { sql: `INSERT INTO produtos (id, referencia, descricao) VALUES ('x', NULL, 'inválido')`, args: [] },
      ],
      'write'
    )
  );

  const produtos = await db.execute({ sql: 'SELECT count(*) AS c FROM produtos', args: [] });
  const movs = await db.execute({ sql: 'SELECT count(*) AS c FROM movimentacoes_estoque', args: [] });
  assert.equal(Number(produtos.rows[0].c), 0);
  assert.equal(Number(movs.rows[0].c), 0);
});

test('propaga erro de gravação sem devolver resultado de sucesso', async () => {
  const stub = {
    execute: async () => ({ rows: [] }),
    batch: async () => {
      throw new Error('falha simulada na gravação');
    },
  } as unknown as Client;

  await assert.rejects(() => executarImportacao(stub, [TOP], 'cadastro', 'lote-x'), /falha simulada/);
});

test('validação do servidor rejeita payload inválido e consolida duplicados idênticos', () => {
  assert.match(
    (validarLinhasImportacao([{ ...TOP, quantidade: -1 }]) as { error: string }).error,
    /quantidade/
  );
  assert.match(
    (validarLinhasImportacao([{ ...TOP, quantidade: 2.5 }]) as { error: string }).error,
    /quantidade/
  );
  assert.match(
    (validarLinhasImportacao([{ ...TOP, descricao: '  ' }]) as { error: string }).error,
    /descrição/
  );
  assert.match(
    (validarLinhasImportacao([{ ...TOP, valor_unitario: -1 }]) as { error: string }).error,
    /valor unitário/
  );
  assert.match(
    (
      validarLinhasImportacao([
        TOP,
        { ...TOP, descricao: 'Outra descrição' },
      ]) as { error: string }
    ).error,
    /divergentes/
  );

  const consolidado = validarLinhasImportacao([
    { ...TOP, quantidade: 4 },
    { ...TOP, quantidade: 6 },
  ]) as { rows: ProductImportRow[] };
  assert.equal(consolidado.rows.length, 1);
  assert.equal(consolidado.rows[0].quantidade, 10);
  assert.equal(consolidado.rows[0].referencia, '306');

  // referência minúscula/duplicada é normalizada, preservando zeros à esquerda
  const normalizada = validarLinhasImportacao([
    { ...TOP, referencia: ' 000306 ' },
  ]) as { rows: ProductImportRow[] };
  assert.equal(normalizada.rows[0].referencia, '000306');
});
