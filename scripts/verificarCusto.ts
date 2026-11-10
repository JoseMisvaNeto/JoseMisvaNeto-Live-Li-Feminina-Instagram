// Auditoria: compara um backup de produtos (backups/custos-*.json) com o estado
// atual do banco e denuncia QUALQUER campo alterado fora de custo/lucro/lucro%.
//
// Uso: npx tsx scripts/verificarCusto.ts <backups/custos-....json>

import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../server/db';

const CAMPOS_PROTEGIDOS = new Set(['custo', 'lucro', 'lucro_percentual']);

const main = async () => {
  const caminho = process.argv[2];
  if (!caminho) {
    console.error('Uso: npx tsx scripts/verificarCusto.ts <backups/custos-....json>');
    process.exit(1);
  }

  const backup = JSON.parse(fs.readFileSync(path.resolve(caminho), 'utf8'));
  const antes = new Map<string, Record<string, unknown>>(
    (backup.produtos as Record<string, unknown>[]).map((p) => [String(p.id), p])
  );

  const db = getDb();
  const atual = await db.execute('SELECT * FROM produtos');
  const agora = atual.rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(r)) o[k] = r[k];
    return o;
  });

  const problemas: string[] = [];
  const idsAgora = new Set(agora.map((p) => String(p.id)));

  for (const id of antes.keys()) {
    if (!idsAgora.has(id)) problemas.push(`PRODUTO REMOVIDO: id ${id} (REF ${antes.get(id)?.referencia})`);
  }

  let camposCustoMudaram = 0;
  for (const p of agora) {
    const b = antes.get(String(p.id));
    if (!b) {
      problemas.push(`PRODUTO CRIADO: REF ${p.referencia}`);
      continue;
    }
    for (const k of Object.keys(b)) {
      if (CAMPOS_PROTEGIDOS.has(k)) continue;
      if (String(b[k] ?? '') !== String(p[k] ?? '')) {
        problemas.push(`CAMPO PROTEGIDO ALTERADO na REF ${p.referencia}: ${k} = ${b[k]} → ${p[k]}`);
      }
    }
    for (const k of CAMPOS_PROTEGIDOS) {
      if (String(b[k] ?? '') !== String(p[k] ?? '')) camposCustoMudaram++;
    }
  }

  const soma = (lista: Record<string, unknown>[], campo: string) =>
    lista.reduce((s, p) => s + (Number(p[campo]) || 0), 0);

  console.log('\n================ AUDITORIA vs BACKUP ================');
  console.log(`Backup ............... ${path.basename(caminho)} (gerado ${backup.gerado_em})`);
  console.log(`Produtos antes/agora . ${antes.size} / ${agora.length}`);
  console.log(`Soma do estoque ...... ${soma([...antes.values()], 'estoque_atual')} → ${soma(agora, 'estoque_atual')}`);
  console.log(`Soma do custo ........ ${soma([...antes.values()], 'custo').toFixed(2)} → ${soma(agora, 'custo').toFixed(2)}`);
  console.log(`Campos custo/lucro alterados: ${camposCustoMudaram}`);
  console.log(`PROBLEMAS ENCONTRADOS: ${problemas.length}`);
  for (const p of problemas) console.log(`  ✗ ${p}`);
  if (problemas.length === 0) console.log('  ✓ Nenhum dado fora de custo/lucro foi tocado.');
  console.log('=====================================================\n');

  if (problemas.length) process.exitCode = 1;
};

main().catch((err) => {
  console.error('ERRO:', err instanceof Error ? err.message : err);
  process.exit(1);
});
