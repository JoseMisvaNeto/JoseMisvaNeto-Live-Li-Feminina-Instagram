/**
 * Classificação de cor/tamanho das sacolas no Modo Separação.
 *
 * Regra aprovada — apenas DUAS cores:
 *   AMARELO = TAM G
 *   VERDE   = TAM P
 *
 * Ordem de avaliação (a primeira regra atingida vence):
 *   1) Regras de AMARELO: pijama · ≥2 conjuntos · ≥3 sutiãs avulsos · peça grande
 *   2) Regras de VERDE:   só calcinhas/cuecas (até 1 conjunto junto) · só até 2 sutiãs avulsos
 *   3) Desempate:         ≥8 peças -> AMARELO, senão VERDE
 *
 * A cor é calculada UMA vez, na criação da sacola, e permanece congelada
 * (compras posteriores não mudam a cor da sacola já iniciada).
 */

export type TamanhoSacola = 'P' | 'G';

export interface MercadoriaClassificacao {
  descricao: string;
  quantidade: number;
}

/** Minúsculas sem acento para casar palavras das descrições do banco. */
const normalizar = (texto: string): string =>
  (texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const PALAVRAS_GRANDES = ['casaco', 'vestido', 'blazer', 'jaqueta', 'saia longa', 'calca'];

export function classificarSacola(mercadorias: MercadoriaClassificacao[]): TamanhoSacola {
  const itens = (mercadorias || []).map((m) => ({
    nome: normalizar(m.descricao),
    quantidade: Number(m.quantidade) || 0,
  }));

  const totalPecas = itens.reduce((s, m) => s + m.quantidade, 0);
  const qtdOnde = (pred: (nome: string) => boolean): number =>
    itens.filter((m) => pred(m.nome)).reduce((s, m) => s + m.quantidade, 0);

  const ehConjunto = (nome: string) => nome.includes('conjunto');
  const ehSutiaAvulso = (nome: string) => nome.includes('sutia') && !nome.includes('extensor');
  const ehCalcinhaOuCueca = (nome: string) => nome.includes('calcinha') || nome.includes('cueca');

  // 1) Regras de AMARELO (TAM G)
  if (itens.some((m) => m.nome.includes('pijama'))) return 'G';
  if (qtdOnde(ehConjunto) >= 2) return 'G';
  if (qtdOnde(ehSutiaAvulso) >= 3) return 'G';
  if (itens.some((m) => PALAVRAS_GRANDES.some((p) => m.nome.includes(p)))) return 'G';

  // 2) Regras de VERDE (TAM P)
  const soCalcinhasCuecas =
    itens.every((m) => ehCalcinhaOuCueca(m.nome) || ehConjunto(m.nome)) &&
    qtdOnde(ehConjunto) <= 1;
  if (soCalcinhasCuecas) return 'P';

  const soSutiasAvulsos = itens.every((m) => ehSutiaAvulso(m.nome));
  if (soSutiasAvulsos) return 'P';

  // 3) Desempate pela quantidade de peças
  return totalPecas >= 8 ? 'G' : 'P';
}
