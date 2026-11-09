// Busca inteligente de produtos com pontuação (ranking) para a tela de Produtos.
//
// O comportamento antigo apenas filtrava mantendo a ordem original da lista,
// então uma referência exata ("4") aparecia depois de qualquer "42", "44"...
// que viesse antes no cadastro. Aqui cada resultado recebe um score de
// relevância e o resultado é ordenado por ele:
//
//   1. referência exata          -> primeiro lugar garantido
//   2. referência numérica igual -> "04" para a busca "4"
//   3. referência com o prefixo  -> "40", "42", "400", "444"...
//   4. referência que contém     -> "14", "24", "A4B"...
//   5. descrição (exata > início > palavra > trecho)
//   6. fornecedor
//   7. valores (preço/custo/lucro)
//
// Desempates usam ordem numérica natural da referência ("40" antes de "400")
// e, por fim, a posição original do produto (ordem estável).
//
// Este módulo é puro (sem DOM, rede ou banco) e recebe o índice pré-calculado
// para que a busca seja rápida mesmo com milhares de produtos a cada tecla.

/** Campos mínimos necessários para a busca (ProdutoRow satisfaz isso). */
export interface ProdutoPesquisavel {
  referencia: string;
  descricao: string;
  fornecedor?: string | null;
  preco_venda?: number;
  custo?: number;
  lucro?: number;
}

/** Remove acentos, caixa e espaços das pontas para comparar de forma justa. */
export const normalize = (str: string): string =>
  (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

// Pontos por nível de relevância (quanto maior, mais acima na lista).
const SCORE_REF_EXATA = 1000;
const SCORE_REF_NUMERICA_EXATA = 950;
const SCORE_REF_PREFIXO = 800;
const SCORE_REF_CONTEM = 600;
const SCORE_DESC_EXATA = 500;
const SCORE_DESC_PREFIXO = 400;
const SCORE_DESC_PALAVRA = 350;
const SCORE_DESC_CONTEM = 300;
const SCORE_FORNECEDOR = 200;
const SCORE_VALOR = 100;

interface ValorIndexado {
  valor: number;
  /** "25.90" */
  texto: string;
  /** "2590" (sem separador decimal) */
  semPonto: string;
}

/** Item do índice: campos já normalizados, sem custo de recalcular por tecla. */
export interface ItemIndice<T extends ProdutoPesquisavel> {
  produto: T;
  ref: string;
  desc: string;
  forn: string;
  valores: ValorIndexado[];
  /** Posição original na lista, usada como desempate estável. */
  ordem: number;
}

/** Monta o índice de busca uma única vez (a cada alteração da lista). */
export const buildIndex = <T extends ProdutoPesquisavel>(produtos: T[]): ItemIndice<T>[] =>
  produtos.map((produto, ordem) => {
    const valores = [
      Number(produto.preco_venda) || 0,
      Number(produto.custo) || 0,
      Number(produto.lucro) || 0,
    ].map((valor) => {
      const texto = valor.toFixed(2);
      return { valor, texto, semPonto: texto.replace('.', '') };
    });
    return {
      produto,
      ref: normalize(produto.referencia),
      desc: normalize(produto.descricao),
      forn: normalize(produto.fornecedor || ''),
      valores,
      ordem,
    };
  });

/** true se `q` aparece em `texto` começando uma palavra (ex.: "4" em "vestido 4 pecas"). */
const iniciaPalavra = (texto: string, q: string): boolean => {
  let i = texto.indexOf(q);
  while (i !== -1) {
    if (i === 0) return true;
    if (!/[a-z0-9]/.test(texto[i - 1])) return true;
    i = texto.indexOf(q, i + 1);
  }
  return false;
};

/**
 * Compara referências em ordem natural: "4" < "40" < "42" < "400" < "444",
 * em vez da ordem lexicográfica ("400" viria antes de "42").
 */
const compararNatural = (a: string, b: string): number => {
  const pa = a.split(/(\d+)/);
  const pb = b.split(/(\d+)/);
  const total = Math.min(pa.length, pb.length);
  for (let i = 0; i < total; i++) {
    const xa = pa[i];
    const xb = pb[i];
    if (xa === xb) continue;
    const na = /^\d+$/.test(xa);
    const nb = /^\d+$/.test(xb);
    if (na && nb) {
      const dif = Number(xa) - Number(xb);
      if (dif !== 0) return dif;
      return xa.length - xb.length; // "04" antes de "4"
    }
    if (na) return -1; // trechos numéricos antes de texto
    if (nb) return 1;
    return xa < xb ? -1 : 1;
  }
  return pa.length - pb.length;
};

/** Devolve a pontuação do item (0 = não corresponde à busca). */
const pontuar = (item: ItemIndice<ProdutoPesquisavel>, q: string, qLimpo: string, qNum: number): number => {
  const { ref, desc, forn } = item;

  // --- Referência: o campo mais importante para quem busca por ref ---
  if (ref === q) return SCORE_REF_EXATA;
  if (qLimpo !== '' && Number.isFinite(qNum) && ref !== '' && Number.isFinite(Number(ref))) {
    // "04" também é a referência "4" (tolerância para erro de ponto flutuante)
    if (Math.abs(Number(ref) - qNum) < 1e-9) return SCORE_REF_NUMERICA_EXATA;
  }
  if (ref.startsWith(q)) return SCORE_REF_PREFIXO;
  if (ref.includes(q)) return SCORE_REF_CONTEM;

  // --- Descrição ---
  if (desc === q) return SCORE_DESC_EXATA;
  if (desc.startsWith(q)) return SCORE_DESC_PREFIXO;
  if (iniciaPalavra(desc, q)) return SCORE_DESC_PALAVRA;
  if (desc.includes(q)) return SCORE_DESC_CONTEM;

  // --- Fornecedor ---
  if (forn !== '' && forn.includes(q)) return SCORE_FORNECEDOR;

  // --- Valores (preço/custo/lucro): aceita "25,9", "25.9", "2590" ou "25" ---
  if (qLimpo !== '' && Number.isFinite(qNum) && qNum >= 0) {
    const qComPonto = qLimpo.replace(',', '.');
    const qSemSeparador = qLimpo.replace(/[.,]/g, '');
    for (const v of item.valores) {
      if (Math.abs(v.valor - qNum) < 0.005) return SCORE_VALOR;
      if (v.texto.includes(qComPonto)) return SCORE_VALOR;
      if (qSemSeparador.length > 0 && v.semPonto.includes(qSemSeparador)) return SCORE_VALOR;
    }
  }

  return 0;
};

/**
 * Filtra e ordena o índice por relevância.
 * Consulta vazia devolve todos os produtos na ordem original.
 */
export const searchProdutos = <T extends ProdutoPesquisavel>(
  index: ItemIndice<T>[],
  rawQuery: string
): T[] => {
  const q = normalize(rawQuery);
  if (!q) return index.map((item) => item.produto);

  const qLimpo = q.replace(/^r\$\s*/, '').replace(/\s/g, '');
  const qNum = Number(qLimpo.replace(',', '.'));

  return index
    .map((item) => ({ item, score: pontuar(item, q, qLimpo, qNum) }))
    .filter((r) => r.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        compararNatural(a.item.ref, b.item.ref) ||
        a.item.ordem - b.item.ordem
    )
    .map((r) => r.item.produto);
};
