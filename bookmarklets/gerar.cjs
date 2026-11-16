// Gera a versão linha única do Monitor PWA (a que vai no favorito) a partir
// do fonte legível. Uso: node bookmarklets/gerar.cjs
const fs = require('fs');
const path = require('path');

const aqui = __dirname;
const fonte = fs.readFileSync(path.join(aqui, 'monitor-pwa.js'), 'utf8');

// Remove os comentários de bloco (/* */) e de linha (//) e junta as linhas.
// Nenhum texto do script contém "/*", "*/" ou "//" dentro de string, então a
// remoção é segura.
const linha = fonte
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((l) => l.replace(/\/\/.*$/, '').trim())
  .filter(Boolean)
  .join('');

new Function(linha); // valida a sintaxe antes de gravar

const destino = path.join(aqui, 'monitor-pwa.min.js');
fs.writeFileSync(destino, 'javascript:' + linha);

console.log('OK |', path.basename(destino), '| javascript:' + linha.length, 'chars | uma linha só:', !linha.includes('\n'));
