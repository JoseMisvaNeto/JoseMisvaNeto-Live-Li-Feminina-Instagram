import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../server/db';

async function main() {
  const db = getDb();
  const dir = path.resolve(process.cwd(), 'scripts');
  const schema = fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8');
  const trigger = fs.readFileSync(path.join(dir, 'trigger.sql'), 'utf8');

  console.log('Aplicando schema...');
  await db.executeMultiple(schema);
  console.log('Aplicando trigger de estoque...');
  await db.executeMultiple(trigger);

  console.log('Backfill da tabela lives...');
  // Datas com vendas pendentes = lives abertas
  await db.execute({
    sql: `INSERT INTO lives (data_live, status)
          SELECT DISTINCT data_live, 'aberta' FROM live_vendas WHERE status = 'pendente'
          ON CONFLICT(data_live) DO UPDATE SET status = 'aberta'`,
    args: [],
  });
  // Datas já registradas no histórico = lives fechadas (se ainda não estiverem)
  await db.execute({
    sql: `INSERT INTO lives (data_live, status)
          SELECT data_live, 'fechada' FROM live_historico WHERE true
          ON CONFLICT(data_live) DO NOTHING`,
    args: [],
  });
  // Vendas não-pendentes de datas sem histórico não devem reabrir lives fechadas
  await db.execute({
    sql: `UPDATE lives SET status = 'fechada'
          WHERE status = 'aberta'
            AND data_live NOT IN (SELECT DISTINCT data_live FROM live_vendas WHERE status = 'pendente')
            AND data_live IN (SELECT data_live FROM live_historico)`,
    args: [],
  });

  const tables = ['live_clientes', 'live_vendas', 'live_vendas_itens', 'produtos', 'movimentacoes_estoque', 'live_historico', 'lives'];
  for (const t of tables) {
    const r = await db.execute({ sql: `SELECT count(*) AS c FROM ${t}`, args: [] });
    console.log(`  ${t}: ${r.rows[0].c} linhas`);
  }
  console.log('Schema aplicado com sucesso.');
}

main().catch((err) => {
  console.error('Erro ao aplicar schema:', err);
  process.exit(1);
});
