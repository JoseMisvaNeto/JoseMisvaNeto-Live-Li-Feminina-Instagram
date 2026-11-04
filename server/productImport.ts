// Importação de produtos via CSV no servidor.
//
// Regras de estoque (a referência é o identificador externo do produto):
//   cadastro   → atualiza descrição/preço e NÃO mexe no estoque existente
//   somar      → soma a quantidade do CSV ao estoque existente
//   substituir → substitui o estoque pela quantidade do CSV
// Produto novo sempre nasce com a quantidade do CSV como estoque inicial.
//
// Toda alteração de estoque passa por movimentacoes_estoque (o trigger do banco
// aplica ENTRADA/SAÍDA), preservando o histórico anterior. A gravação inteira é
// feita em um único db.batch (transação atômica do libsql): ou grava tudo, ou nada.

import { randomUUID } from 'node:crypto';
import type { Client, InStatement } from '@libsql/client';

export type ProductImportMode = 'cadastro' | 'somar' | 'substituir';

export const PRODUCT_IMPORT_MODES: ProductImportMode[] = ['cadastro', 'somar', 'substituir'];

export interface ProductImportRow {
  referencia: string;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
}

export interface ProdutoExistente {
  id: string;
  referencia: string;
  estoque_atual: number;
  custo: number;
}

export interface ProductImportPlan {
  statements: InStatement[];
  criados: number;
  atualizados: number;
  unidades: number;
  movimentacoes: number;
}

export interface ProductImportResult {
  criados: number;
  atualizados: number;
  unidades: number;
  movimentacoes: number;
  lote: string;
}

const normalizarRef = (ref: unknown) => String(ref ?? '').trim().toUpperCase();
const arredondar2 = (valor: number) => Math.round(valor * 100) / 100;

export function modoImportacaoValido(modo: unknown): modo is ProductImportMode {
  return PRODUCT_IMPORT_MODES.includes(modo as ProductImportMode);
}

/**
 * Valida o payload vindo do cliente (defesa em profundidade; o cliente já valida)
 * e consolida referências repetidas idênticas.
 */
export function validarLinhasImportacao(
  entrada: unknown
): { rows: ProductImportRow[] } | { error: string } {
  if (!Array.isArray(entrada) || entrada.length === 0) {
    return { error: 'Nenhum produto para importar' };
  }

  const linhas: ProductImportRow[] = [];
  for (let i = 0; i < entrada.length; i++) {
    const bruto = (entrada[i] || {}) as Record<string, unknown>;
    const referencia = normalizarRef(bruto.referencia);
    const descricao = String(bruto.descricao ?? '').trim();
    if (!referencia) return { error: `Registro ${i + 1}: referência vazia` };
    if (!descricao) return { error: `Referência ${referencia}: descrição vazia` };

    const quantidade = Number(bruto.quantidade);
    if (!Number.isInteger(quantidade) || quantidade < 0) {
      return { error: `Referência ${referencia}: quantidade deve ser um número inteiro não negativo` };
    }
    const valor = Number(bruto.valor_unitario);
    if (!Number.isFinite(valor) || valor < 0) {
      return { error: `Referência ${referencia}: valor unitário inválido` };
    }

    linhas.push({
      referencia,
      descricao,
      quantidade,
      valor_unitario: arredondar2(valor),
    });
  }

  const consolidadas = new Map<string, ProductImportRow>();
  const divergentes = new Set<string>();
  for (const linha of linhas) {
    const atual = consolidadas.get(linha.referencia);
    if (!atual) {
      consolidadas.set(linha.referencia, { ...linha });
      continue;
    }
    if (atual.descricao !== linha.descricao || atual.valor_unitario !== linha.valor_unitario) {
      divergentes.add(linha.referencia);
      continue;
    }
    atual.quantidade += linha.quantidade;
  }
  if (divergentes.size > 0) {
    return { error: `Referências com dados divergentes: ${Array.from(divergentes).join(', ')}` };
  }

  return { rows: Array.from(consolidadas.values()) };
}

/** Monta as instruções SQL da importação, sem executar nada. */
export function planProductImport(
  rows: ProductImportRow[],
  existentes: ProdutoExistente[],
  mode: ProductImportMode,
  lote: string
): ProductImportPlan {
  const porReferencia = new Map<string, ProdutoExistente>();
  for (const produto of existentes) {
    porReferencia.set(normalizarRef(produto.referencia), {
      id: String(produto.id),
      referencia: normalizarRef(produto.referencia),
      estoque_atual: Number(produto.estoque_atual) || 0,
      custo: Number(produto.custo) || 0,
    });
  }

  const statements: InStatement[] = [];
  let criados = 0;
  let atualizados = 0;
  let unidades = 0;
  let movimentacoes = 0;

  const registrarMovimentacao = (
    produtoId: string,
    tipo: 'ENTRADA' | 'SAÍDA',
    quantidade: number,
    descricao: string
  ) => {
    if (quantidade <= 0) return;
    statements.push({
      sql: `INSERT INTO movimentacoes_estoque (id, produto_id, tipo, quantidade, descricao, origem_id, data)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [randomUUID(), produtoId, tipo, quantidade, descricao, lote, new Date().toISOString()],
    });
    movimentacoes++;
  };

  for (const row of rows) {
    const referencia = normalizarRef(row.referencia);
    const quantidade = Math.trunc(Number(row.quantidade) || 0);
    const preco = arredondar2(Number(row.valor_unitario) || 0);
    unidades += quantidade;

    const existente = porReferencia.get(referencia);

    if (!existente) {
      const id = randomUUID();
      // Nasce zerado e recebe o estoque inicial via movimentação ENTRADA,
      // assim o histórico do produto já começa coerente.
      statements.push({
        sql: `INSERT INTO produtos
                (id, referencia, descricao, preco_venda, estoque_atual, custo, lucro, lucro_percentual,
                 estoque_minimo, fornecedor, data_cadastro)
              VALUES (?, ?, ?, ?, 0, 0, ?, 0, 5, NULL, datetime('now'))`,
        args: [id, referencia, row.descricao, preco, preco],
      });
      registrarMovimentacao(id, 'ENTRADA', quantidade, 'Importação CSV — estoque inicial');
      criados++;
      porReferencia.set(referencia, {
        id,
        referencia,
        estoque_atual: quantidade,
        custo: 0,
      });
      continue;
    }

    const custo = Number(existente.custo) || 0;
    const lucro = arredondar2(preco - custo);
    const lucroPercentual = custo > 0 ? Math.round(((preco - custo) / custo) * 10000) / 100 : 0;

    statements.push({
      sql: `UPDATE produtos
               SET descricao = ?, preco_venda = ?, lucro = ?, lucro_percentual = ?
             WHERE id = ?`,
      args: [row.descricao, preco, lucro, lucroPercentual, existente.id],
    });
    atualizados++;

    if (mode === 'somar') {
      registrarMovimentacao(existente.id, 'ENTRADA', quantidade, 'Importação CSV — entrada');
      existente.estoque_atual += quantidade;
    } else if (mode === 'substituir') {
      const delta = quantidade - existente.estoque_atual;
      if (delta > 0) {
        registrarMovimentacao(existente.id, 'ENTRADA', delta, 'Importação CSV — substituição de estoque');
      } else if (delta < 0) {
        registrarMovimentacao(existente.id, 'SAÍDA', -delta, 'Importação CSV — substituição de estoque');
      }
      existente.estoque_atual = quantidade;
    }
    // mode === 'cadastro': estoque permanece como está
  }

  return { statements, criados, atualizados, unidades, movimentacoes };
}

async function carregarProdutosExistentes(db: Client): Promise<ProdutoExistente[]> {
  const resultado = await db.execute({
    sql: 'SELECT id, referencia, estoque_atual, custo FROM produtos',
    args: [],
  });
  return resultado.rows.map((row) => {
    const dados = row as unknown as Record<string, unknown>;
    return {
      id: String(dados.id),
      referencia: String(dados.referencia ?? ''),
      estoque_atual: Number(dados.estoque_atual) || 0,
      custo: Number(dados.custo) || 0,
    };
  });
}

/**
 * Executa a importação inteira em um único batch transacional.
 * Se qualquer instrução falhar, o batch é revertido e o erro é propagado.
 */
export async function executarImportacao(
  db: Client,
  rows: ProductImportRow[],
  mode: ProductImportMode,
  lote: string = randomUUID()
): Promise<ProductImportResult> {
  const existentes = await carregarProdutosExistentes(db);
  const plano = planProductImport(rows, existentes, mode, lote);

  if (plano.statements.length > 0) {
    await db.batch(plano.statements, 'write');
  }

  return {
    criados: plano.criados,
    atualizados: plano.atualizados,
    unidades: plano.unidades,
    movimentacoes: plano.movimentacoes,
    lote,
  };
}
