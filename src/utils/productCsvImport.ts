// Leitura do CSV de catálogo de produtos usado na tela de Produtos/Estoque.
// Colunas obrigatórias: referencia, descricao, quantidade, valor_unitario.
// Regras: UTF-8 (com ou sem BOM), delimitador detectado, referência como texto,
// decimal brasileiro (139,90) e consolidação de referências repetidas.
//
// Este módulo é puro (não acessa banco nem DOM) para poder ser testado e
// reaproveitado. Nada aqui grava dados.

import Papa from 'papaparse';
import type { ProdutoImportMode } from '../lib/api';

export type { ProdutoImportMode };

export interface ProductCsvRow {
  /** Referência normalizada (trim + maiúsculas), preservando zeros à esquerda. */
  referencia: string;
  descricao: string;
  /** Quantidade consolidada (soma das linhas idênticas). */
  quantidade: number;
  /** Preço unitário em reais, arredondado em centavos. */
  valor_unitario: number;
  /** Linhas do arquivo que originaram este registro (1 = primeira linha). */
  linhas: number[];
}

export interface ProductCsvError {
  linha: number;
  referencia?: string;
  motivo: string;
}

export interface ProductCsvConflict {
  referencia: string;
  linhas: number[];
  motivo: string;
}

export interface ProductCsvDuplicate {
  referencia: string;
  linhas: number[];
}

export interface ProductCsvParseResult {
  rows: ProductCsvRow[];
  errors: ProductCsvError[];
  duplicadas: ProductCsvDuplicate[];
  conflitos: ProductCsvConflict[];
  /** Linhas de dados não vazias lidas do arquivo. */
  totalLinhas: number;
  /** Registros válidos (referências únicas após consolidação). */
  totalValidos: number;
  /** Linhas de dados rejeitadas. */
  totalErros: number;
  somaQuantidades: number;
  cabecalhoInvalido: string | null;
  /** true quando há conflito/erro de cabeçalho: não deve importar. */
  bloqueado: boolean;
}

export const PRODUCT_CSV_COLUMNS = ['referencia', 'descricao', 'quantidade', 'valor_unitario'] as const;
export type ProductCsvColumn = (typeof PRODUCT_CSV_COLUMNS)[number];

const COLUMN_LABELS: Record<ProductCsvColumn, string> = {
  referencia: 'referencia',
  descricao: 'descricao',
  quantidade: 'quantidade',
  valor_unitario: 'valor_unitario',
};

// Cabeçalhos aceitos (já normalizados: sem acento, minúsculos, sem pontuação).
const COLUMN_ALIASES: Record<ProductCsvColumn, string[]> = {
  referencia: ['referencia', 'referencia produto', 'ref', 'ref produto', 'codigo', 'codigo produto'],
  descricao: ['descricao', 'descricao produto', 'produto', 'nome', 'nome produto'],
  quantidade: ['quantidade', 'qtd', 'qtde', 'quantidade fisica', 'estoque', 'estoque atual'],
  valor_unitario: [
    'valor unitario',
    'valor unit',
    'valor',
    'preco',
    'preco unitario',
    'preco venda',
    'valor venda',
  ],
};

const normalizarRef = (ref: unknown) => String(ref ?? '').trim().toUpperCase();

/** Cabeçalho comparável: sem BOM, sem acentos, minúsculo e sem pontuação. */
function normalizarCabecalho(bruto: unknown): string {
  return String(bruto ?? '')
    .replace(/^\uFEFF/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Detecta o separador contando os candidatos na primeira linha não vazia. */
export function detectarDelimitador(texto: string): string {
  const primeiraLinha = String(texto ?? '')
    .split(/\r?\n/)
    .find((linha) => linha.trim().length > 0) || '';

  const candidatos: { delimitador: string; total: number }[] = [
    { delimitador: ';', total: (primeiraLinha.match(/;/g) || []).length },
    { delimitador: '\t', total: (primeiraLinha.match(/\t/g) || []).length },
    { delimitador: ',', total: (primeiraLinha.match(/,/g) || []).length },
  ];
  candidatos.sort((a, b) => b.total - a.total);
  if (candidatos[0].total === 0) return ';';
  return candidatos[0].delimitador;
}

/** Quantidade: apenas inteiro não negativo. Separação de milhar (1.000) é aceita. */
export function parseQuantidadeBr(bruto: unknown): { valor?: number; erro?: string } {
  const texto = String(bruto ?? '').trim();
  if (!texto) return { erro: 'quantidade vazia' };

  const negativo = /^-/.test(texto);
  let corpo = texto.replace(/^[+-]/, '').replace(/[\s\u00a0]/g, '');
  if (!corpo) return { erro: `quantidade inválida (${texto})` };

  // "1.000" / "1.234.567" = separador de milhar; qualquer outra pontuação é decimal
  if (/^\d{1,3}(\.\d{3})+$/.test(corpo)) {
    corpo = corpo.replace(/\./g, '');
  } else if (/[.,]/.test(corpo)) {
    return { erro: `quantidade decimal (${texto}) — informe apenas números inteiros` };
  }

  if (!/^\d+$/.test(corpo)) return { erro: `quantidade inválida (${texto})` };
  if (negativo) return { erro: `quantidade negativa (${texto})` };

  const valor = Number(corpo);
  if (!Number.isSafeInteger(valor)) return { erro: `quantidade inválida (${texto})` };
  return { valor };
}

/** Valor unitário em reais: aceita "139,90", "R$ 139,90", "1.234,56" e "139.90". */
export function parseValorUnitarioBr(bruto: unknown): { valor?: number; erro?: string } {
  const original = String(bruto ?? '').trim();
  if (!original) return { erro: 'valor unitário vazio' };

  const texto = original.replace(/R\$/gi, '').replace(/[\s\u00a0]/g, '');
  const negativo = /^-/.test(texto);
  const corpo = texto.replace(/^[+-]/, '');
  if (!corpo) return { erro: `valor unitário inválido (${original})` };
  if (!/^[\d.,]+$/.test(corpo)) return { erro: `valor unitário inválido (${original})` };

  const temVirgula = corpo.includes(',');
  const temPonto = corpo.includes('.');
  let normalizado = corpo;

  if (temVirgula && temPonto) {
    // o separador decimal é o último que aparece
    if (corpo.lastIndexOf(',') > corpo.lastIndexOf('.')) {
      normalizado = corpo.replace(/\./g, '').replace(/,/g, '.');
    } else {
      normalizado = corpo.replace(/,/g, '');
    }
  } else if (temVirgula) {
    const partes = corpo.split(',');
    // mais de uma vírgula = separador de milhar (1,234,567)
    normalizado = partes.length > 2 ? corpo.replace(/,/g, '') : corpo.replace(',', '.');
  } else if (temPonto) {
    const partes = corpo.split('.');
    if (partes.length > 2) {
      normalizado = corpo.replace(/\./g, '');
    } else if (partes[1].length === 3) {
      // "1.234" é milhar (R$ 1.234,00), como no restante do app
      normalizado = partes[0] + partes[1];
    }
  }

  if (!/^\d+(\.\d+)?$/.test(normalizado)) {
    return { erro: `valor unitário inválido (${original})` };
  }
  if (negativo) return { erro: `valor unitário negativo (${original})` };

  const numero = Number(normalizado);
  if (!Number.isFinite(numero)) return { erro: `valor unitário inválido (${original})` };
  return { valor: Math.round(numero * 100) / 100 };
}

const parar = (motivo: string): ProductCsvParseResult => ({
  rows: [],
  errors: [],
  duplicadas: [],
  conflitos: [],
  totalLinhas: 0,
  totalValidos: 0,
  totalErros: 0,
  somaQuantidades: 0,
  cabecalhoInvalido: motivo,
  bloqueado: true,
});

/**
 * Lê o texto do CSV e devolve registros consolidados + erros por linha.
 * Não grava nada; a confirmação do usuário é obrigatória antes da gravação.
 */
export function parseProductCsv(texto: string): ProductCsvParseResult {
  const textoLimpo = String(texto ?? '').replace(/^\uFEFF/, '');
  if (!textoLimpo.trim()) return parar('Arquivo CSV vazio.');

  const delimitador = detectarDelimitador(textoLimpo);
  const parsed = Papa.parse<string[]>(textoLimpo, {
    header: false,
    skipEmptyLines: false,
    delimiter: delimitador,
  });
  const linhas = (parsed.data || []) as unknown[][];

  const primeiraLinha = linhas.findIndex((linha) =>
    (linha || []).some((celula) => String(celula ?? '').trim() !== '')
  );
  if (primeiraLinha === -1) return parar('Arquivo CSV vazio.');

  const cabecalho = (linhas[primeiraLinha] || []).map(normalizarCabecalho);
  const indices: Partial<Record<ProductCsvColumn, number>> = {};
  const ausentes: string[] = [];
  for (const coluna of PRODUCT_CSV_COLUMNS) {
    const indice = cabecalho.findIndex((h) => COLUMN_ALIASES[coluna].includes(h));
    if (indice === -1) ausentes.push(COLUMN_LABELS[coluna]);
    else indices[coluna] = indice;
  }
  if (ausentes.length > 0) {
    return parar(
      `Coluna(s) obrigatória(s) ausente(s): ${ausentes.join(', ')}. ` +
        `Encontrado: ${(linhas[primeiraLinha] || []).map((c) => String(c ?? '').trim()).join(' | ')}`
    );
  }

  const grupos = new Map<
    string,
    { referencia: string; descricao: string; quantidade: number; valor_unitario: number; linhas: number[] }
  >();
  const errors: ProductCsvError[] = [];
  const conflitos: ProductCsvConflict[] = [];
  const conflitosPorRef = new Map<string, ProductCsvConflict>();
  let totalLinhas = 0;

  for (let i = primeiraLinha + 1; i < linhas.length; i++) {
    const linha = linhas[i] || [];
    if (linha.every((celula) => String(celula ?? '').trim() === '')) continue;
    totalLinhas++;
    const numeroLinha = i + 1;

    const referencia = normalizarRef(linha[indices.referencia!]);
    const descricao = String(linha[indices.descricao!] ?? '').trim();
    const quantidade = parseQuantidadeBr(linha[indices.quantidade!]);
    const valor = parseValorUnitarioBr(linha[indices.valor_unitario!]);

    if (!referencia) {
      errors.push({ linha: numeroLinha, motivo: 'referência vazia' });
      continue;
    }
    if (!descricao) {
      errors.push({ linha: numeroLinha, referencia, motivo: 'descrição vazia' });
      continue;
    }
    if (quantidade.erro) {
      errors.push({ linha: numeroLinha, referencia, motivo: quantidade.erro });
      continue;
    }
    if (valor.erro) {
      errors.push({ linha: numeroLinha, referencia, motivo: valor.erro });
      continue;
    }

    const existente = grupos.get(referencia);
    if (!existente) {
      grupos.set(referencia, {
        referencia,
        descricao,
        quantidade: quantidade.valor!,
        valor_unitario: valor.valor!,
        linhas: [numeroLinha],
      });
      continue;
    }

    // Mesma referência repetida: idêntica consolida; divergente bloqueia.
    const divergencias: string[] = [];
    if (existente.descricao !== descricao) divergencias.push('descrição');
    if (existente.valor_unitario !== valor.valor) divergencias.push('valor unitário');

    if (divergencias.length > 0) {
      existente.linhas.push(numeroLinha);
      const anterior = conflitosPorRef.get(referencia);
      const motivo = divergencias.join(' e ');
      if (anterior) {
        if (!anterior.linhas.includes(numeroLinha)) anterior.linhas.push(numeroLinha);
        if (!anterior.motivo.includes(motivo)) anterior.motivo += `, ${motivo}`;
      } else {
        const conflito: ProductCsvConflict = {
          referencia,
          linhas: [...existente.linhas],
          motivo,
        };
        conflitosPorRef.set(referencia, conflito);
        conflitos.push(conflito);
      }
      continue;
    }

    existente.quantidade += quantidade.valor!;
    existente.linhas.push(numeroLinha);
  }

  const rows: ProductCsvRow[] = Array.from(grupos.values());
  const duplicadas: ProductCsvDuplicate[] = rows
    .filter((row) => row.linhas.length > 1)
    .map((row) => ({ referencia: row.referencia, linhas: row.linhas }));

  const somaQuantidades = rows.reduce((total, row) => total + row.quantidade, 0);

  return {
    rows,
    errors,
    duplicadas,
    conflitos,
    totalLinhas,
    totalValidos: rows.length,
    totalErros: errors.length,
    somaQuantidades,
    cabecalhoInvalido: null,
    bloqueado: conflitos.length > 0,
  };
}
