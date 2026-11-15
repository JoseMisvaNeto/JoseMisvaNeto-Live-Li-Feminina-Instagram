// Store externo dos comentários da live — APENAS em memória.
// Nada é persistido (localStorage) nem enviado ao banco: este store existe
// só para o painel flutuante da tela Live.
//
// Por que um store externo: os comentários chegam via postMessage a cada
// alguns segundos durante a live. Se fôssemos useState no App, cada comentário
// re-renderizaria a árvore inteira (tela Live + Separação + modais) e isso
// poderia engasgar a fluidez da live. Com useSyncExternalStore no painel,
// só o painel re-renderiza — o App não.
export type ComentarioLive = {
  id: string;
  username: string;
  texto: string;
  recebidoEm: number;
  usado: boolean;
};

const LIMITE = 100;

let comentarios: ComentarioLive[] = [];
let naoLidos = 0;
const ouvintes = new Set<() => void>();

const notificar = () => {
  ouvintes.forEach((fn) => fn());
};

/** Adiciona um comentário (dedup por id, mais novo em cima, teto de 100). */
export function adicionarComentario(dados: {
  id?: string;
  username?: string;
  texto?: string;
}): boolean {
  const username = String(dados.username || '')
    .replace(/^@/, '')
    .trim()
    .slice(0, 80);
  const texto = String(dados.texto || '')
    .trim()
    .slice(0, 400);
  if (!username && !texto) return false;

  const id = String(dados.id || `${username}::${texto}`).slice(0, 140);
  if (comentarios.some((c) => c.id === id)) return false;

  comentarios = [
    { id, username, texto, recebidoEm: Date.now(), usado: false },
    ...comentarios,
  ].slice(0, LIMITE);
  naoLidos = Math.min(naoLidos + 1, 999);
  notificar();
  return true;
}

/** Marca um comentário como já usado (linha fica desbotada com ✓). */
export function marcarUsado(id: string): void {
  if (!comentarios.some((c) => c.id === id && !c.usado)) return;
  comentarios = comentarios.map((c) => (c.id === id ? { ...c, usado: true } : c));
  notificar();
}

/** Limpa a lista do painel (botão 🗑). */
export function limparComentarios(): void {
  if (comentarios.length === 0 && naoLidos === 0) return;
  comentarios = [];
  naoLidos = 0;
  notificar();
}

/** Zera o contador de novos ao abrir o painel. */
export function zerarNaoLidos(): void {
  if (naoLidos === 0) return;
  naoLidos = 0;
  notificar();
}

export function getComentarios(): ComentarioLive[] {
  return comentarios;
}

export function getNaoLidos(): number {
  return naoLidos;
}

/** Assinatura para useSyncExternalStore. */
export function assinarComentarios(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => {
    ouvintes.delete(fn);
  };
}
