/**
 * Extrai o perfil de Instagram de um texto recebido por arrastar/colar.
 *
 * A tela Live aceita o comentário arrastado para qualquer lugar: o monitor
 * envia só o nome de usuário, mas um texto selecionado pode vir como
 * "@usuario  quero a peça azul". Devolvemos sempre "@usuario" — ou null
 * quando o texto não parece um perfil (evita preencher a busca por engano
 * com código de produto ou frase copiada).
 */
export function extrairPerfilInstagram(texto: string): string | null {
  const limpo = (texto || '').replace(/\s+/g, ' ').trim();
  if (!limpo) return null;

  const comArroba = limpo.match(/@([A-Za-z0-9._]{1,30})/);
  if (comArroba) {
    // Remove ponto final de frase: "@maria." -> "@maria"
    return `@${comArroba[1].replace(/\.+$/, '')}`;
  }

  // Sem "@": só aceita um único token com pelo menos uma letra (usuário).
  // Assim "123456" (código de produto) e frases não preenchem a busca.
  if (/^[A-Za-z0-9._]{2,30}$/.test(limpo) && /[A-Za-z]/.test(limpo)) {
    return `@${limpo.replace(/\.+$/, '')}`;
  }

  return null;
}
