/*
 * MONITOR PWA — versão JANELA (arrastável, redimensionável, minimizável)
 * -------------------------------------------------------------
 * Mantém a coleta de comentários do script original e adiciona:
 *   • BARRA ROSA ...... segure e leve a janela para qualquer lugar
 *   • BARRA INFERIOR .. arraste para mudar SÓ a altura (largura é fixa,
 *                       igual à original: 320px)
 *   • "–" ............. minimiza (só a barra); clique de novo restaura
 *   • CLIQUE no item .. copia o @perfil para o app preencher a busca
 *   • REPETIÇÃO ....... mesmo cliente repetindo o mesmo texto (ex.: "quero o
 *                       G" na peça A e de novo na peça B) gera UM ITEM NOVO.
 *                       Só é ignorado o clone instantâneo do próprio IG
 *                       (re-render nos primeiros JANELA_MS).
 *
 * INSTALAÇÃO: cole a versão linha única (monitor-pwa.min.js) no favorito.
 * Para regerar após editar este arquivo:  node bookmarklets/gerar.cjs
 * Clicar de novo no favorito: recria o painel e limpa o intervalo antigo.
 */
(function () {
  const id = 'monitor-arrastavel';

  // Reexecução: derruba o painel e o setInterval antigo. Sem isso, o intervalo
  // continua vivo criando itens num painel já removido (vazamento).
  const antigo = document.getElementById(id);
  if (antigo) antigo.remove();
  if (window.__mpIntervalo) clearInterval(window.__mpIntervalo);

  const p = document.createElement('div');
  p.id = id;
  p.style.cssText = 'position:fixed;top:10px;right:10px;width:320px;min-width:320px;max-width:320px;height:96vh;min-height:44px;background:#1a1a1a;color:#fff;z-index:99999;font-family:sans-serif;border-left:4px solid #d62976;box-shadow:-5px 0 15px rgba(0,0,0,.5);display:flex;flex-direction:column;border-radius:6px;overflow:hidden;box-sizing:border-box;';

  p.innerHTML =
    "<div id='barra-p' style='cursor:move;user-select:none;display:flex;align-items:center;justify-content:space-between;gap:8px;background:#d62976;padding:6px 8px;font-size:13px;font-weight:bold;flex:0 0 auto;'>" +
    "<span style='overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'>&#128717; Monitor PWA (<span id='cont-p'>0</span>)</span>" +
    "<span id='mini-p' title='Minimizar / restaurar' style='cursor:pointer;background:rgba(255,255,255,.25);border-radius:4px;padding:0 7px;'>&ndash;</span>" +
    "</div>" +
    "<div id='lista-p' style='flex:1 1 auto;overflow:hidden;padding:8px;'></div>" +
    "<div id='redim-p' title='Arraste para cima/baixo mudar a altura' style='position:absolute;left:0;right:0;bottom:0;height:10px;cursor:ns-resize;background:linear-gradient(to right,transparent 42%,rgba(214,41,118,.75) 42%,rgba(214,41,118,.75) 58%,transparent 58%);'></div>";

  document.body.appendChild(p);
  const l = p.querySelector('#lista-p');
  const cont = p.querySelector('#cont-p');

  // ---------- MOVER (barra superior, como janela do Windows) ----------
  p.querySelector('#barra-p').addEventListener('mousedown', function (ev) {
    if (ev.target.id === 'mini-p') return; // o botão de minimizar não arrasta
    ev.preventDefault();
    const r = p.getBoundingClientRect(); // painel inteiro (não a barra: ela fica
    const dx = ev.clientX - r.left;      // 4px dentro por causa da borda)
    const dy = ev.clientY - r.top;
    // troca a âncora 'right' por 'left' para poder arrastar nos dois eixos
    p.style.left = r.left + 'px';
    p.style.top = r.top + 'px';
    p.style.right = 'auto';
    function mover(e) {
      let x = e.clientX - dx;
      let y = e.clientY - dy;
      // nunca some da tela: a barra fica sempre à mão na horizontal...
      x = Math.max(-r.width + 80, Math.min(x, window.innerWidth - 80));
      // ...e a base nunca passa do rodapé (senão a barra de altura fica fora)
      y = Math.max(0, Math.min(y, Math.max(0, window.innerHeight - r.height)));
      p.style.left = x + 'px';
      p.style.top = y + 'px';
    }
    function soltar() {
      document.removeEventListener('mousemove', mover);
      document.removeEventListener('mouseup', soltar);
    }
    document.addEventListener('mousemove', mover);
    document.addEventListener('mouseup', soltar);
  });

  // ---------- ALTURA (barra inferior; a largura é FIXA, igual à original) ----------
  p.querySelector('#redim-p').addEventListener('mousedown', function (ev) {
    ev.preventDefault();
    ev.stopPropagation();
    const r = p.getBoundingClientRect();
    const y0 = ev.clientY; // referência: onde o mouse ESTAVA quando clicou
    const altura0 = r.height;
    function redim(e) {
      // só muda a altura, exatamente o tanto que o mouse andou (nada de dobrar)
      const h = Math.min(window.innerHeight, Math.max(44, altura0 + (e.clientY - y0)));
      p.style.height = h + 'px';
    }
    function soltar() {
      document.removeEventListener('mousemove', redim);
      document.removeEventListener('mouseup', soltar);
    }
    document.addEventListener('mousemove', redim);
    document.addEventListener('mouseup', soltar);
  });

  // ---------- MINIMIZAR / RESTAURAR ----------
  let alturaGuardada = null;
  p.querySelector('#mini-p').addEventListener('click', function (ev) {
    ev.stopPropagation();
    const lista = p.querySelector('#lista-p');
    const minimizado = lista.style.display === 'none';
    if (minimizado) {
      lista.style.display = '';
      p.style.height = alturaGuardada || '96vh';
      ev.target.textContent = '\u2013';
    } else {
      alturaGuardada = p.style.height;
      lista.style.display = 'none';
      p.style.height = 'auto';
      ev.target.textContent = '+';
    }
  });

  // ---------- COLETA DE COMENTÁRIOS ----------
  // Três proteções, cada uma para um problema diferente:
  // 1) feitos (WeakMap nó -> texto já levado ao painel): o seletor roda a
  //    cada 800ms e o IG mantém o comentário no DOM — o MESMO nó não pode
  //    entrar2×. É WeakMap (e não só "nó marcado") porque o IG pode REUSAR
  //    o nó para outro comentário: se o texto do nó mudou, ele é processado.
  // 2) vistos (Map texto -> hora): trava curta de JANELA_MS só contra o IG
  //    recriar o MESMO comentário num nó novo (re-render). Passou da janela,
  //    o mesmo texto do mesmo cliente entra de novo — é isso que faz o
  //    "quero o G" da peça B aparecer depois do "quero o G" da peça A.
  // 3) t.length <= 1: texto ainda vazio/incompleto; não marca o nó, para
  //    reavaliar no próximo tick quando o texto chegar inteiro.
  const JANELA_MS = 5000;
  const feitos = new WeakMap();
  const vistos = new Map();
  window.__mpIntervalo = setInterval(function () {
    if (!document.getElementById(id)) {
      clearInterval(window.__mpIntervalo);
      return;
    }
    const c = document.querySelectorAll('div[role="button"] span[dir="auto"]');
    c.forEach(function (s) {
      const t = s.innerText;
      const pai = s.closest('div');
      let u = pai ? (pai.querySelector('span') || {}).innerText : 'Usuario';
      u = (u || 'Usuario').replace('@', '').trim();
      if (t.length <= 1) return; // texto incompleto: reavalia no próximo tick
      const idU = u + t;
      if (feitos.get(s) === idU) return; // este nó já está no painel
      const agora = Date.now();
      if (agora - (vistos.get(idU) || 0) < JANELA_MS) {
        // clone/re-render do IG do MESMO comentário dentro da janela:
        // já mostramos isso agora há pouco — marca o nó e não duplica
        feitos.set(s, idU);
        return;
      }
      // evento novo: ou um comentário que nunca vimos, ou o cliente
      // repetindo o mesmo texto (peça B) depois da janela — entra de novo
      const i = document.createElement('div');
      i.style.cssText = 'margin-bottom:4px;padding:6px 8px;background:#2a2a2a;border-radius:4px;border-left:4px solid #ffdc80;cursor:grab;user-select:all;display:flex;flex-direction:column;justify-content:center;';
      i.setAttribute('draggable', 'true');
      i.title = 'Clique = envia o perfil ao app · arraste = leva o perfil';
      i.onmousedown = function () {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(i.querySelector('strong'));
        sel.removeAllRanges();
        sel.addRange(range);
      };
      i.ondragstart = function (e) {
        e.dataTransfer.setData('text/plain', u);
        i.style.opacity = '0.5';
      };
      i.ondragend = function () {
        i.style.opacity = '1';
      };
      i.onclick = function () {
        try {
          navigator.clipboard.writeText('@' + u);
        } catch (e) {}
        i.style.borderLeftColor = '#ccff00';
        setTimeout(function () {
          i.style.borderLeftColor = '#ffdc80';
        }, 600);
      };
      i.innerHTML = "<strong style='color:#ffdc80;font-size:16px;display:block;line-height:1.1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'>" + u + "</strong><span style='font-size:11px;color:#bbb;display:block;line-height:1.1;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'>" + t + "</span>";
      l.prepend(i);
      feitos.set(s, idU);
      vistos.set(idU, agora);
      if (l.children.length > 15) l.removeChild(l.lastChild);
      cont.textContent = String(l.children.length);
    });
  }, 800);
})();
