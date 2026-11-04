// Baixa e devolução de estoque ligadas aos itens de venda da tela Acerto.
//
// `produtos.estoque_atual` não é alterado aqui: quem aplica o ajuste é o
// trigger `tr_atualizar_estoque` (scripts/trigger.sql), disparado sempre que
// entra uma linha em movimentacoes_estoque com tipo 'SAÍDA' ou 'ENTRADA'.
//
// Toda movimentação criada por este módulo guarda em `origem_id` o id do item
// de venda (live_vendas_itens.id). Com isso dá para saber o líquido já baixado
// para cada item e devolver o estoque apenas quando o item for excluído.
// Vendas antigas, lançadas antes deste recurso, não têm movimentação vinculada
// e por isso não sofrem estorno automático.

import { randomUUID } from 'node:crypto';
import type { Client, InValue } from '@libsql/client';

type Db = Client;

/** Instrução pronta para entrar em um `db.batch` (tudo na mesma transação). */
export type SqlStmt = { sql: string; args: InValue[] };

export interface ItemVendaEstoque {
  id: number | string;
  referencia: string;
  quantidade: number;
}

export interface ResultadoLiquidacao {
  itens: number;
  ajustes: number;
}

const TIPO_SAIDA = 'SAÍDA';
const TIPO_ENTRADA = 'ENTRADA';

const INSERT_MOVIMENTACAO = `INSERT INTO movimentacoes_estoque
  (id, produto_id, tipo, quantidade, origem_id, descricao, data)
  VALUES (?, ?, ?, ?, ?, ?, ?)`;

// Soma (baixas - devoluções) — usar junto com GROUP BY.
const SOMA_LIQUIDA = `SUM(CASE WHEN tipo = ? THEN quantidade
                              WHEN tipo = ? THEN -quantidade
                              ELSE 0 END)`;

function inList(valores: string[]): { placeholders: string; args: InValue[] } {
  return { placeholders: valores.map(() => '?').join(','), args: valores };
}

/** Referência em forma canônica para comparação (sem espaços, sem caixa). */
const normalizarRef = (valor: unknown): string => String(valor ?? '').trim().toUpperCase();

function movimentacaoStmt(
  produtoId: string,
  tipo: string,
  quantidade: number,
  origemId: string | null,
  descricao: string | null
): SqlStmt {
  return {
    sql: INSERT_MOVIMENTACAO,
    args: [
      randomUUID(),
      produtoId,
      tipo,
      quantidade,
      origemId,
      descricao,
      new Date().toISOString(),
    ],
  };
}

/** Procura o id do produto pela referência (ignora espaços e maiúsculas/minúsculas). */
export async function buscarProdutoIdPorRef(
  db: Db,
  referencia: unknown
): Promise<string | null> {
  const ref = String(referencia ?? '').trim();
  if (!ref) return null;
  const r = await db.execute({
    sql: 'SELECT id FROM produtos WHERE TRIM(referencia) = ? COLLATE NOCASE LIMIT 1',
    args: [ref],
  });
  if (r.rows.length === 0) return null;
  const id = (r.rows[0] as Record<string, unknown>).id;
  return id == null ? null : String(id);
}

/**
 * Grava uma movimentação de estoque vinculada a um item de venda.
 * `delta` positivo dá baixa (SAÍDA), negativo devolve (ENTRADA) e zero não faz
 * nada. Retorna `false` (sem erro) quando a referência não existe em
 * `produtos` — não há estoque a mexer nesse caso.
 */
export async function movimentarEstoqueItem(
  db: Db,
  params: { itemId: number | string; referencia: unknown; delta: number; descricao?: string | null }
): Promise<boolean> {
  const delta = Math.trunc(Number(params.delta) || 0);
  if (delta === 0) return false;

  const produtoId = await buscarProdutoIdPorRef(db, params.referencia);
  if (!produtoId) return false;

  await db.execute(
    movimentacaoStmt(
      produtoId,
      delta > 0 ? TIPO_SAIDA : TIPO_ENTRADA,
      Math.abs(delta),
      String(params.itemId),
      params.descricao ?? null
    )
  );
  return true;
}

/** Baixa de estoque ao registrar um item de venda (tela Acerto). */
export function baixarEstoqueItem(
  db: Db,
  params: { itemId: number | string; referencia: unknown; quantidade: number; descricao?: string | null }
): Promise<boolean> {
  return movimentarEstoqueItem(db, { ...params, delta: params.quantidade });
}

/**
 * Monta as movimentações de ESTORNO dos itens informados: devolve ao estoque o
 * líquido que já foi baixado por cada um deles. Itens sem movimentação
 * vinculada não geram estorno.
 *
 * As instruções são devolvidas (em vez de executadas) para que a rota possa
 * rodá-las na mesma transação dos DELETEs, via `db.batch`.
 */
export async function gerarEstornosItens(
  db: Db,
  itemIds: Array<number | string>
): Promise<SqlStmt[]> {
  const ids = [...new Set(itemIds.map((v) => String(v ?? '').trim()).filter((v) => v !== ''))];
  if (ids.length === 0) return [];

  const { placeholders, args } = inList(ids);
  const r = await db.execute({
    sql: `SELECT origem_id, produto_id, ${SOMA_LIQUIDA} AS liquido
          FROM movimentacoes_estoque
          WHERE origem_id IN (${placeholders}) AND produto_id IS NOT NULL
          GROUP BY origem_id, produto_id`,
    args: [TIPO_SAIDA, TIPO_ENTRADA, ...args],
  });

  const stmts: SqlStmt[] = [];
  for (const row of r.rows) {
    const r2 = row as Record<string, unknown>;
    const liquido = Math.trunc(Number(r2.liquido) || 0);
    if (liquido <= 0) continue;
    stmts.push(
      movimentacaoStmt(String(r2.produto_id), TIPO_ENTRADA, liquido, String(r2.origem_id), 'Estorno de item de venda')
    );
  }
  return stmts;
}

/**
 * Fecha o estoque de uma live (chamado pelo Acerto ao finalizar).
 *
 * A baixa de cada venda já acontece no lançamento do item (POST /itens). Aqui
 * apenas completamos o que faltou para as vendas pagas:
 *   - item sem baixa (vendas antigas) ou baixa parcial → grava a diferença;
 *   - item já baixado integralmente → não faz nada (evita baixa dupla);
 * e desvinculamos (`origem_id = NULL`) as movimentações desses itens para que a
 * limpeza posterior da live não estorne uma venda que foi paga.
 *
 * `itens` vem do estado local do Acerto (apenas sacolas pagas), do mesmo jeito
 * que o cálculo anterior de estoque era feito no navegador.
 */
export async function liquidarEstoqueLive(
  db: Db,
  dataLive: string,
  itens: ItemVendaEstoque[]
): Promise<ResultadoLiquidacao> {
  const lista = (Array.isArray(itens) ? itens : [])
    .map((i) => ({
      id: String(i?.id ?? '').trim(),
      referencia: normalizarRef(i?.referencia),
      quantidade: Math.trunc(Math.abs(Number(i?.quantidade) || 0)),
    }))
    .filter((i) => i.id !== '' && i.quantidade > 0);

  if (lista.length === 0) return { itens: 0, ajustes: 0 };

  const ids = [...new Set(lista.map((i) => i.id))];

  // 1. Líquido já baixado para cada item
  const movIn = inList(ids);
  const movs = await db.execute({
    sql: `SELECT origem_id, ${SOMA_LIQUIDA} AS liquido
          FROM movimentacoes_estoque
          WHERE origem_id IN (${movIn.placeholders})
          GROUP BY origem_id`,
    args: [TIPO_SAIDA, TIPO_ENTRADA, ...movIn.args],
  });
  const liquidoPorItem = new Map<string, number>();
  for (const row of movs.rows) {
    const r = row as Record<string, unknown>;
    liquidoPorItem.set(String(r.origem_id), Math.trunc(Number(r.liquido) || 0));
  }

  // 2. Id do produto para cada referência (catálogo inteiro: são poucas linhas
  //    e evita uma consulta por item)
  const produtoPorRef = new Map<string, string>();
  const prods = await db.execute({
    sql: 'SELECT TRIM(referencia) AS ref, id FROM produtos',
    args: [],
  });
  for (const row of prods.rows) {
    const r = row as Record<string, unknown>;
    produtoPorRef.set(normalizarRef(r.ref), String(r.id));
  }

  // 3. Diferença entre o que deveria estar baixado e o que já foi
  const stmts: SqlStmt[] = [];
  let ajustes = 0;
  for (const item of lista) {
    const produtoId = produtoPorRef.get(item.referencia);
    if (!produtoId) continue;
    const resto = item.quantidade - (liquidoPorItem.get(item.id) || 0);
    if (resto === 0) continue;
    stmts.push(
      movimentacaoStmt(
        produtoId,
        resto > 0 ? TIPO_SAIDA : TIPO_ENTRADA,
        Math.abs(resto),
        null,
        `VENDA LIVE - ${dataLive}`
      )
    );
    ajustes++;
  }

  // 4. Desvincula as movimentações dos itens: o saldo já está correto e os itens
  //    serão apagados em seguida — sem desvincular, a exclusão estornaria a venda.
  const idIn = inList(ids);
  stmts.push({
    sql: `UPDATE movimentacoes_estoque SET origem_id = NULL WHERE origem_id IN (${idIn.placeholders})`,
    args: idIn.args,
  });

  await db.batch(stmts, 'write');
  return { itens: lista.length, ajustes };
}
