// Gera as duas versões do monitor a partir do fonte:
//   monitor-comentarios.min.js       -> com prefixo javascript: (favorito)
//   monitor-comentarios-console.js   -> sem prefixo (colar no Console do DevTools)
// Uso: node bookmarklets/gerar.js   (requer esbuild instalado)
const fs = require('fs');
const path = require('path');

const aqui = __dirname;
const fonte = fs.readFileSync(path.join(aqui, 'monitor-comentarios.js'), 'utf8').trim();
const codigo = fonte.startsWith('javascript:') ? fonte.slice(11) : fonte;
new Function(codigo); // valida sintaxe

const tmpIn = path.join(aqui, '.tmp-bm.js');
const tmpOut = path.join(aqui, '.tmp-bm.min.js');
fs.writeFileSync(tmpIn, codigo);

const { execSync } = require('child_process');
execSync(`npx esbuild "${tmpIn}" --minify --outfile="${tmpOut}"`, { stdio: 'pipe' });

let min = fs.readFileSync(tmpOut, 'utf8').trim();
fs.writeFileSync(path.join(aqui, 'monitor-comentarios.min.js'), 'javascript:' + min);
fs.writeFileSync(path.join(aqui, 'monitor-comentarios-console.js'), min);
fs.unlinkSync(tmpIn);
fs.unlinkSync(tmpOut);

new Function(min);
const checks = {
  semQuebraDeLinha: !min.includes('\n'),
  comecaComIIFE: /^\(|^!|^var\s/.test(min.slice(0, 20)),
  semPrefixoJs: !min.startsWith('javascript:'),
  temPonte: min.includes('ponte-comentarios'),
  chars: min.length,
};
console.log('OK | console (sem prefixo):', checks);
console.log('OK | favorito (com prefixo): javascript:' + min.length, 'chars');
