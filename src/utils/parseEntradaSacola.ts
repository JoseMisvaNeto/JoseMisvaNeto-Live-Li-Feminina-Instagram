/**
 * Interpreta o que foi digitado no campo de sacola do Modo Separação.
 *
 * Formatos aceitos (uma sacola por linha):
 *   "77"     -> { codigo: '77', qtd: 1 }   (comportamento original: 1 peça)
 *   "77*3"   -> { codigo: '77', qtd: 3 }   (multiplicador de PDV: 3 peças de uma vez)
 *   "77 * 3" -> aceita espaços ao redor do "*"
 *
 * Retorna null para entrada vazia ou formato inválido ("77*", "77*0",
 * "77*abc", "77**3", "*3") — nesses casos o campo é mantido para o
 * operador corrigir (o caller não limpa o input).
 */

export interface EntradaSacola {
  codigo: string;
  qtd: number;
}

export function parseEntradaSacola(entrada: string): EntradaSacola | null {
  const bruto = (entrada || '').trim().toUpperCase();
  if (!bruto) return null;

  if (!bruto.includes('*')) {
    return { codigo: bruto, qtd: 1 };
  }

  const partes = bruto.split('*');
  if (partes.length !== 2) return null; // "77**3" ou "*3*" etc.

  const codigo = partes[0].trim();
  const qtdTexto = partes[1].trim();
  if (!codigo) return null; // "*3"
  if (!/^\d+$/.test(qtdTexto)) return null; // "77*", "77*abc", "77*-2"

  const qtd = Number.parseInt(qtdTexto, 10);
  if (qtd < 1) return null; // "77*0"

  return { codigo, qtd };
}
