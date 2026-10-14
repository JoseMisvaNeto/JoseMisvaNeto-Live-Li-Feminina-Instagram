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

  const tables = ['live_clientes', 'live_vendas', 'live_vendas_itens', 'produtos', 'movimentacoes_estoque', 'live_historico'];
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
