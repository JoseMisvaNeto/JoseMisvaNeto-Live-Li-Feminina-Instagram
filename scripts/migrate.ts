import fs from 'node:fs';
import path from 'node:path';
import { getDb, toBool } from '../server/db';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não configuradas no .env');
  process.exit(1);
}

async function fetchAll(table: string, columns: string): Promise<any[]> {
  const all: any[] = [];
  const step = 1000;
  let from = 0;
  for (;;) {
    const url = `${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(columns)}&order=id.asc&offset=${from}&limit=${step}`;
    const res = await fetch(url, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
    const data = await res.json();
    all.push(...data);
    if (!data || data.length < step) break;
    from += step;
    process.stdout.write(`\r  ${table}: ${all.length} linhas...`);
  }
  process.stdout.write(`\r  ${table}: ${all.length} linhas OK\n`);
  return all;
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const db = getDb();
  const dir = path.resolve(process.cwd(), 'scripts');

  console.log('1/4 Aplicando schema (sem trigger)...');
  await db.executeMultiple(fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8'));

  console.log('2/4 Exportando do Supabase...');
  const clientes = await fetchAll('live_clientes', 'id, username, nome_completo, telefone, created_at, codigo_cliente, bloqueada, observacoes');
  const produtos = await fetchAll('produtos', 'id, referencia, descricao, preco_venda, estoque_atual, custo, lucro, lucro_percentual, estoque_minimo, data_cadastro, fornecedor');
  const vendas = await fetchAll('live_vendas', 'id, cliente_id, data_live, pago, valor_ajuste, mensagem_enviada, status, created_at, qtd_live, entregue');
  const itens = await fetchAll('live_vendas_itens', 'id, venda_id, referencia, preco, quantidade, created_at');
  const movimentacoes = await fetchAll('movimentacoes_estoque', 'id, produto_id, tipo, quantidade, data, origem_id, descricao');
  const historico = await fetchAll('live_historico', 'id, data_live, dia_semana, qtd_sacolas, valor_total, observacoes, created_at');

  console.log('3/4 Importando no Turso (preservando IDs)...');

  const stmtClientes = clientes.map((c) => ({
    sql: `INSERT INTO live_clientes (id, username, nome_completo, telefone, created_at, codigo_cliente, bloqueada, observacoes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      Number(c.id),
      String(c.username || ''),
      String(c.nome_completo || ''),
      c.telefone ?? null,
      c.created_at ?? null,
      c.codigo_cliente != null ? Number(c.codigo_cliente) : null,
      toBool(c.bloqueada) ? 1 : 0,
      c.observacoes ?? null,
    ],
  }));
  for (const b of chunks(stmtClientes, 500)) await db.batch(b, 'write');

  const stmtProdutos = produtos.map((p) => ({
    sql: `INSERT INTO produtos (id, referencia, descricao, preco_venda, estoque_atual, custo, lucro, lucro_percentual, estoque_minimo, data_cadastro, fornecedor)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      String(p.id),
      String(p.referencia || ''),
      String(p.descricao || ''),
      Number(p.preco_venda) || 0,
      Number(p.estoque_atual) || 0,
      Number(p.custo) || 0,
      Number(p.lucro) || 0,
      Number(p.lucro_percentual) || 0,
      Number(p.estoque_minimo) || 5,
      p.data_cadastro ?? null,
      p.fornecedor ?? null,
    ],
  }));
  for (const b of chunks(stmtProdutos, 500)) await db.batch(b, 'write');

  const stmtVendas = vendas.map((v) => ({
    sql: `INSERT INTO live_vendas (id, cliente_id, data_live, pago, valor_ajuste, mensagem_enviada, status, created_at, qtd_live, entregue)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      Number(v.id),
      v.cliente_id != null ? Number(v.cliente_id) : null,
      String(v.data_live),
      toBool(v.pago) ? 1 : 0,
      Number(v.valor_ajuste) || 0,
      toBool(v.mensagem_enviada) ? 1 : 0,
      String(v.status || 'pendente'),
      v.created_at ?? null,
      Number(v.qtd_live) || 0,
      toBool(v.entregue) ? 1 : 0,
    ],
  }));
  for (const b of chunks(stmtVendas, 500)) await db.batch(b, 'write');

  const stmtItens = itens.map((it) => ({
    sql: `INSERT INTO live_vendas_itens (id, venda_id, referencia, preco, quantidade, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      Number(it.id),
      it.venda_id != null ? Number(it.venda_id) : null,
      String(it.referencia || ''),
      Number(it.preco) || 0,
      Number(it.quantidade) || 0,
      it.created_at ?? null,
    ],
  }));
  for (const b of chunks(stmtItens, 500)) await db.batch(b, 'write');

  const stmtMovs = movimentacoes.map((m) => ({
    sql: `INSERT INTO movimentacoes_estoque (id, produto_id, tipo, quantidade, data, origem_id, descricao)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      String(m.id),
      m.produto_id != null ? String(m.produto_id) : null,
      String(m.tipo || ''),
      Number(m.quantidade) || 0,
      m.data ?? null,
      m.origem_id != null ? String(m.origem_id) : null,
      m.descricao ?? null,
    ],
  }));
  for (const b of chunks(stmtMovs, 500)) await db.batch(b, 'write');

  const stmtHist = historico.map((h) => ({
    sql: `INSERT INTO live_historico (id, data_live, dia_semana, qtd_sacolas, valor_total, observacoes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      Number(h.id),
      String(h.data_live),
      h.dia_semana ?? null,
      Number(h.qtd_sacolas) || 0,
      Number(h.valor_total) || 0,
      h.observacoes ?? null,
      h.created_at ?? null,
    ],
  }));
  for (const b of chunks(stmtHist, 500)) await db.batch(b, 'write');

  console.log('4/4 Aplicando trigger de estoque...');
  await db.executeMultiple(fs.readFileSync(path.join(dir, 'trigger.sql'), 'utf8'));

  console.log('\nConferência de contagens:');
  const esperado: Record<string, number> = {
    live_clientes: clientes.length,
    live_vendas: vendas.length,
    live_vendas_itens: itens.length,
    produtos: produtos.length,
    movimentacoes_estoque: movimentacoes.length,
    live_historico: historico.length,
  };
  let ok = true;
  for (const [t, expected] of Object.entries(esperado)) {
    const r = await db.execute({ sql: `SELECT count(*) AS c FROM ${t}`, args: [] });
    const actual = Number(r.rows[0].c);
    const status = actual === expected ? 'OK' : `FALHOU (esperado ${expected}, obtido ${actual})`;
    if (actual !== expected) ok = false;
    console.log(`  ${t}: ${actual} ${status}`);
  }

  if (!ok) {
    console.error('\nMigração incompleta! Verifique os erros acima.');
    process.exit(1);
  }
  console.log('\nMigração concluída com sucesso!');
}

main().catch((err) => {
  console.error('Erro na migração:', err);
  process.exit(1);
});
