// Importa custos de um CSV (Ref,Custo) para o campo `custo` dos produtos.
//
// Regras (definidas com o usuário):
//   1. Comparação EXATA de referência entre o CSV e o banco (apenas trim).
//   2. Só REFs que já existem no banco são atualizadas — nada é criado.
//   3. Sobrescreve o custo mesmo que já exista valor.
//   4. NÃO toca em estoque/saldo, nem em nenhum outro dado do banco.
//      Única exceção: `lucro` e `lucro_percentual`, que são DERIVADOS do custo
//      e não têm gatilho no banco — a mesma fórmula usada pelo endpoint
//      PATCH /produtos/:id (server/routes.ts). Sem isso a tela mostraria
//      lucro desatualizado.
//   5. Backup do estado atual antes de qualquer gravação.
//
// Uso:
//   npx tsx scripts/importarCusto.ts <caminho.csv>            → relatório (padrão)
//   npx tsx scripts/importarCusto.ts <caminho.csv> --aplicar  → backup + gravação

import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { getDb } from '../server/db';

interface CustoCsv {
  ref: string;
  custoBruto: string;
  linha: number;
}

type ParseCusto =
  | { tipo: 'numero'; valor: number }
  | { tipo: 'vazio' }
  | { tipo: 'invalido' };

interface ProdutoBanco {
  id: string;
  referencia: string;
  preco_venda: number;
  custo: number;
}

/** Interpreta o valor de custo. Nada é chutado: o que não for inequívoco vira "invalido". */
const parseCusto = (raw: string): ParseCusto => {
  const s = String(raw ?? '')
    .replace(/^r\$\s*/i, '')
    .replace(/\s/g, '');
  if (s === '') return { tipo: 'vazio' };
  if (/^\d+$/.test(s)) return { tipo: 'numero', valor: Number(s) };
  // decimal com ponto ("2.5", "59.9") ou vírgula ("12,50")
  if (/^\d*\.\d+$/.test(s) || /^\d+\.$/.test(s)) return { tipo: 'numero', valor: Number(s) };
  if (/^\d+,\d+$/.test(s)) return { tipo: 'numero', valor: Number(s.replace(',', '.')) };
  return { tipo: 'invalido' };
};

const lerCsv = (caminho: string): CustoCsv[] => {
  const texto = fs.readFileSync(caminho, 'utf8');

  // Tenta detecção automática e, se não achar as colunas, testa , e ;
  const tentativas: Array<Record<string, unknown>[]> = [
    Papa.parse<Record<string, unknown>>(texto, { header: true, skipEmptyLines: true }).data,
    Papa.parse<Record<string, unknown>>(texto, { header: true, delimiter: ',', skipEmptyLines: true }).data,
    Papa.parse<Record<string, unknown>>(texto, { header: true, delimiter: ';', skipEmptyLines: true }).data,
  ];

  const chave = (obj: Record<string, unknown>, alvo: string): string | null => {
    const k = Object.keys(obj).find((c) => c.toLowerCase().replace(/[^a-z]/g, '') === alvo);
    return k ?? null;
  };

  for (const dados of tentativas) {
    if (dados.length === 0) continue;
    const kRef = chave(dados[0], 'ref');
    const kCusto = chave(dados[0], 'custo');
    if (!kRef || !kCusto) continue;

    return dados.map((row, i) => ({
      ref: String(row[kRef] ?? '').trim(),
      custoBruto: String(row[kCusto] ?? '').trim(),
      linha: i + 2, // +2 = cabeçalho (linha 1)
    }));
  }

  throw new Error('Não consegui identificar as colunas "Ref." e "Custo" no CSV.');
};

// Mesma fórmula de server/routes.ts (PATCH /produtos/:id)
const calcLucro = (preco: number, custo: number) => Math.round((preco - custo) * 100) / 100;
const calcLucroPct = (custo: number, preco: number) =>
  custo > 0 ? Math.round(((preco - custo) / custo) * 10000) / 100 : 0;

const brl = (v: number) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const main = async () => {
  const caminho = process.argv[2];
  if (!caminho) {
    console.error('Uso: npx tsx scripts/importarCusto.ts <caminho.csv> [--aplicar]');
    process.exit(1);
  }
  const aplicar = process.argv.includes('--aplicar');
  const arquivo = path.resolve(caminho);
  if (!fs.existsSync(arquivo)) throw new Error(`Arquivo não encontrado: ${arquivo}`);

  const linhas = lerCsv(arquivo);
  const db = getDb();

  // ---- Banco ----
  const res = await db.execute(
    'SELECT id, referencia, preco_venda, custo FROM produtos ORDER BY referencia'
  );
  const produtos = res.rows.map((r) => ({
    id: String(r.id),
    referencia: String(r.referencia),
    preco_venda: Number(r.preco_venda) || 0,
    custo: Number(r.custo) || 0,
  })) as ProdutoBanco[];

  const porRef = new Map<string, ProdutoBanco>();
  const refsDuplicadasBanco: string[] = [];
  for (const p of produtos) {
    if (porRef.has(p.referencia)) refsDuplicadasBanco.push(p.referencia);
    else porRef.set(p.referencia, p);
  }

  // ---- Cruzamento (comparação EXATA, só trim) ----
  const paraAplicar: Array<{ produto: ProdutoBanco; novoCusto: number }> = [];
  const semCustoNoBanco: string[] = [];
  const semCustoFora: string[] = [];
  const invalidos: Array<{ linha: number; ref: string; valor: string }> = [];
  const naoExiste: string[] = [];
  const semMudanca: string[] = [];
  const vistos = new Set<string>();
  const duplicadosCsv: string[] = [];
  const quaseMiss: string[] = [];

  for (const l of linhas) {
    if (!l.ref) continue;
    if (vistos.has(l.ref)) duplicadosCsv.push(l.ref);
    vistos.add(l.ref);

    const parsed = parseCusto(l.custoBruto);
    if (parsed.tipo === 'vazio') {
      (porRef.has(l.ref) ? semCustoNoBanco : semCustoFora).push(l.ref);
      continue;
    }
    if (parsed.tipo === 'invalido') {
      invalidos.push({ linha: l.linha, ref: l.ref, valor: l.custoBruto });
      continue;
    }

    const produto = porRef.get(l.ref);
    if (!produto) {
      naoExiste.push(l.ref);
      // Só para visibilidade: quase-bate por zero à esquerdo/caixa
      const normalizar = (s: string) => s.trim().toLowerCase().replace(/^0+(?=\d)/, '');
      const proximo = produtos.find((p) => normalizar(p.referencia) === normalizar(l.ref));
      if (proximo) quaseMiss.push(`"${l.ref}" (CSV) ≈ "${proximo.referencia}" (banco)`);
      continue;
    }

    if (Math.abs(produto.custo - parsed.valor) < 0.005) {
      semMudanca.push(l.ref);
      continue;
    }
    paraAplicar.push({ produto, novoCusto: parsed.valor });
  }

  const refsBancoNaoCitadas = produtos.filter((p) => !vistos.has(p.referencia));

  // ================= RELATÓRIO =================
  console.log('\n================ RELATÓRIO DE IMPORTAÇÃO DE CUSTOS ================');
  console.log(`Arquivo: ${arquivo}`);
  console.log(`Linhas no CSV .............. ${linhas.filter((l) => l.ref).length}`);
  console.log(`Produtos no banco .......... ${produtos.length}`);
  console.log(`...dos quais já têm custo ≠ 0  ${produtos.filter((p) => p.custo !== 0).length}`);
  console.log(`REFs para atualizar ........ ${paraAplicar.length}`);
  console.log(`...com custo atual ≠ 0 (substituído) ${paraAplicar.filter((a) => a.produto.custo !== 0).length}`);
  console.log(`Já com o mesmo custo ....... ${semMudanca.length}`);
  console.log(`CSV sem valor de custo ..... ${semCustoNoBanco.length + semCustoFora.length} (${semCustoNoBanco.length} no banco, mantidos como estão)`);
  console.log(`REF inexistente no banco ... ${naoExiste.length} (IGNORADAS)`);
  console.log(`Valor inválido no CSV ...... ${invalidos.length}`);
  console.log(`Banco sem REF no CSV ....... ${refsBancoNaoCitadas.length} (intocados)`);
  if (duplicadosCsv.length) console.log(`REF duplicada no CSV ....... ${duplicadosCsv.length} (${duplicadosCsv.join(', ')})`);
  if (refsDuplicadasBanco.length) console.log(`⚠ REF duplicada no banco ... ${refsDuplicadasBanco.join(', ')}`);

  if (invalidos.length) {
    console.log('\n--- VALORES NÃO NUMÉRICOS (ignorados) ---');
    for (const i of invalidos) console.log(`  linha ${i.linha}: REF ${i.ref} = "${i.valor}"`);
  }

  if (naoExiste.length) {
    console.log('\n--- REFs DO CSV QUE NÃO EXISTEM NO BANCO (ignoradas) ---');
    console.log(`  ${naoExiste.join(', ')}`);
  }

  if (quaseMiss.length) {
    console.log('\n--- ⚠ QUASE-BATE (diferem só por zero à esquerdo/caixa) ---');
    for (const q of quaseMiss) console.log(`  ${q}`);
  }

  if (paraAplicar.length) {
    console.log('\n--- CUSTOS QUE SERÃO GRAVADOS (antigo → novo) ---');
    for (const { produto, novoCusto } of paraAplicar) {
      console.log(
        `  REF ${produto.referencia.padStart(6)}: ${brl(produto.custo).padStart(12)}  →  ${brl(novoCusto).padStart(12)}   (venda ${brl(produto.preco_venda)})`
      );
    }
  }

  if (semMudanca.length) {
    console.log(`\n--- SEM MUDANÇA (custo já correto): ${semMudanca.join(', ')} ---`);
  }
  if (semCustoNoBanco.length) {
    console.log(`\n--- SEM CUSTO NO CSV → PRODUTOS DO BANCO FICAM COMO ESTÃO: ${semCustoNoBanco.join(', ')} ---`);
  }
  if (semCustoFora.length) {
    console.log(`\n--- SEM CUSTO NO CSV (e fora do banco): ${semCustoFora.join(', ')} ---`);
  }

  // ================= APLICAÇÃO =================
  if (!aplicar) {
    console.log('\n>>> MODO RELATÓRIO: nada foi alterado no banco.');
    console.log('>>> Para gravar, rode de novo com --aplicar');
    console.log('==================================================================\n');
    return;
  }

  if (paraAplicar.length === 0) {
    console.log('\nNada para gravar.');
    return;
  }

  // Backup prévio (mesmo formato dos backups existentes)
  const backupsDir = path.resolve(process.cwd(), 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });
  const carimbo = new Date().toISOString().replace(/:/g, '-');
  const backupPath = path.join(backupsDir, `custos-${carimbo}.json`);
  const todos = await db.execute('SELECT * FROM produtos');
  fs.writeFileSync(
    backupPath,
    JSON.stringify({ gerado_em: new Date().toISOString(), origem: arquivo, produtos: todos.rows }, null, 2),
    'utf8'
  );
  console.log(`\nBackup salvo em: ${backupPath}`);

  // Gravação: SOMENTE custo + campos derivados dele (nada de estoque/outras tabelas)
  let gravados = 0;
  const falhas: string[] = [];
  for (const { produto, novoCusto } of paraAplicar) {
    try {
      const lucro = calcLucro(produto.preco_venda, novoCusto);
      const lucroPct = calcLucroPct(novoCusto, produto.preco_venda);
      const r = await db.execute({
        sql: 'UPDATE produtos SET custo = ?, lucro = ?, lucro_percentual = ? WHERE id = ?',
        args: [novoCusto, lucro, lucroPct, produto.id],
      });
      if (r.rowsAffected === 0) falhas.push(produto.referencia);
      else gravados++;
    } catch (err) {
      falhas.push(`${produto.referencia} (${(err as Error).message})`);
    }
  }

  // Verificação: relê o banco e confere se bate com o CSV
  const depois = await db.execute('SELECT referencia, custo FROM produtos');
  const conferencia = new Map(depois.rows.map((r) => [String(r.referencia), Number(r.custo) || 0]));
  const divergencias = paraAplicar.filter(
    (a) => Math.abs((conferencia.get(a.produto.referencia) ?? NaN) - a.novoCusto) >= 0.005
  );

  console.log('\n================ RESULTADO ================');
  console.log(`Gravados .................. ${gravados}`);
  console.log(`Falhas .................... ${falhas.length}${falhas.length ? ` (${falhas.join(', ')})` : ''}`);
  console.log(`Divergências na conferência ${divergencias.length}${divergencias.length ? ` (${divergencias.map((d) => d.produto.referencia).join(', ')})` : ''}`);
  console.log('Nenhuma outra tabela/campo foi alterado (estoque, vendas, clientes...).');
  console.log('==========================================\n');

  if (falhas.length || divergencias.length) process.exitCode = 1;
};

main().catch((err) => {
  console.error('\nERRO:', err instanceof Error ? err.message : err);
  process.exit(1);
});
