/**
 * Extrai o perfil de Instagram de um texto recebido por arrastar/colar.
 *
 * A tela Live aceita o comentário arrastado para qualquer lugar: o monitor
 * envia só o nome de usuário (ou o nome completo do perfil, com espaços),
 * mas um texto selecionado pode vir como "@usuario  quero a peça azul".
 * Devolvemos "@usuario" — o nome completo exato quando é nome próprio —
 * ou null quando o texto não parece um perfil (evita preencher a busca por
 * engano com código de produto ou frase copiada).
 */
export function extrairPerfilInstagram(texto: string): string | null {
  const limpo = (texto || '').replace(/\s+/g, ' ').trim();
  if (!limpo) return null;

  // Nome de perfil COM ESPAÇOS ("Andressa Grittens", com ou sem "@"): o
  // monitor também envia o nome completo do perfil. Só é aceito quando TODAS
  // as palavras começam com maiúscula (nome próprio) e não há pontuação de
  // frase — assim "quero a peça azul" e "Atenção: pedido" continuam rejeitadas.
  // Devolve o nome EXATO (sem "@") para a busca encontrar pelo nome.
  const semArroba = limpo.startsWith('@') ? limpo.slice(1).trim() : limpo;
  if (semArroba.includes(' ') && semArroba.length <= 60) {
    const palavras = semArroba.split(' ');
    const ehNomeProprio = palavras.length >= 2 && palavras.length <= 5 &&
      palavras.every(p => /^\p{Lu}[\p{L}'’.-]*$/u.test(p));
    if (ehNomeProprio) return semArroba.replace(/\.+$/, '');
  }

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
