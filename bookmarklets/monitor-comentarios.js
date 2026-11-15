javascript:(function(){
  /*
   * MONITOR DE COMENTÁRIOS DA LIVE — v2
   * ------------------------------------
   * 1) Clique no botão "📱 Instagram" da tela Live do app (abre o IG ao lado).
   * 2) Cole ESTE script inteiro num marcador e clique nele 1 vez no IG.
   * 3) Pronto: comentários são encaminhados ao app em tempo real
   *    (painel flutuante 💬 na borda direita da tela Live).
   *
   * Canais (testados nesta ordem):
   *   1. window.opener  — IG aberto pelo botão do app (tempo real)
   *   2. janela nomeada 'live-app' — IG aberto manualmente
   *   3. cópia — clique no item copia @username; no app use "📋 Colar" ou Ctrl+V
   *
   * Clique num item = envia ao app + copia (sempre os dois, com feedback).
   * Arrastar (plano B) continua funcionando.
   * Sem setInterval: usa MutationObserver (leve, não trava a live).
   * Comentário repetido do MESMO perfil com o MESMO texto volta a aparecer
   * após 60s (antes disso é o IG re-desenhando a lista = duplicado).
   * Rode de novo para remover o painel.
   */
  var ID = 'monitor-comentarios-v2';
  var APP = 'live-app';
  var ORIGENS_OK = ['http://localhost:3000', 'http://127.0.0.1:3000'];
  var LIMITE = 50;

  var antigo = document.getElementById(ID);
  if (antigo) { antigo.remove(); return; }

  // ---------- estado ----------
  // chave username|texto -> timestamp da 1ª vez visto.
  // Repetição do MESMO texto do MESMO perfil só é ignorada se ocorrer em
  // menos de 60s (aí é o IG re-desenhando a lista). Passou de 60s = peça
  // nova do cliente e o comentário aparece normalmente.
  var vistos = new Map();
  var JANELA_REPETICAO_MS = 60000;
  var nosVistos = new WeakSet(); // nós de DOM já processados
  var itens = [];                // histórico (mais novo em cima)
  var pausado = false;
  var status = 'detectando…';
  var canal = null;              // 'opener' | 'named' | 'copy'
  var contador = 0;

  // ---------- janela do app ----------
  function janelaOpener() {
    try {
      if (window.opener && !window.opener.closed) return window.opener;
    } catch (e) { /* pode travar por cross-origin em algumas versões */ }
    return null;
  }
  function janelaNomeada() {
    try {
      var w = window.open('', APP);
      if (!w || w === window) return null;
      var href = '';
      try { href = String(w.location.href); } catch (e) { return w; } // cross-origin = é o app
      if (!href || href === 'about:blank') { try { w.close(); } catch (e) {} return null; }
      if (href.indexOf('localhost') !== -1 || href.indexOf('127.0.0.1') !== -1) return w;
      return null;
    } catch (e) { return null; }
  }
  function alvoApp() {
    var w = janelaOpener();
    if (w) { canal = 'opener'; return w; }
    w = janelaNomeada();
    if (w) { canal = 'named'; return w; }
    canal = 'copy';
    return null;
  }

  // ---------- envio ----------
  function enviar(username, texto, id) {
    var w = alvoApp();
    var payload = { type: 'comentario', id: id, username: username, texto: texto };
    if (w) {
      try {
        // origem de destino: o app valida event.origin === instagram.com no RECEBIMENTO;
        // aqui escolhemos o destino seguro com '*'-like restrito às origens do app
        for (var i = 0; i < ORIGENS_OK.length; i++) {
          try { w.postMessage(payload, ORIGENS_OK[i]); } catch (e) {}
        }
        return true;
      } catch (e) {}
    }
    return false;
  }

  function copiar(texto, aoTerminar) {
    var ok = function () { if (aoTerminar) aoTerminar(true); };
    var falhou = function () {
      try {
        var ta = document.createElement('textarea');
        ta.value = texto;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        var r = document.execCommand('copy');
        ta.remove();
        if (aoTerminar) aoTerminar(!!r);
      } catch (e) { if (aoTerminar) aoTerminar(false); }
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texto).then(ok, falhou);
        return;
      }
    } catch (e) {}
    falhou();
  }

  // ---------- captura de comentários ----------
  function lerComentarios() {
    var spans = document.querySelectorAll('div[role="button"] span[dir="auto"]');
    var novos = [];
    for (var i = 0; i < spans.length; i++) {
      var s = spans[i];
      if (nosVistos.has(s)) continue;
      nosVistos.add(s);
      var t = '';
      try { t = (s.innerText || '').trim(); } catch (e) {}
      if (!t || t.length < 2) continue;
      var pai = s.closest('div');
      var u = '';
      try { u = pai && pai.querySelector('span') ? (pai.querySelector('span').innerText || '') : ''; } catch (e) {}
      u = String(u).replace('@', '').trim();
      if (!u || u === t) {
        // fallback: âncora /usuario/ dentro do mesmo bloco
        var a = pai ? pai.querySelector('a[href^="/"]') : null;
        if (a) u = String(a.getAttribute('href') || '').replace(/\//g, '').trim();
      }
      if (!u || u.length > 80) continue;
      var chave = u + '|' + t;
      var agora = Date.now();
      var vistoQuando = vistos.get(chave);
      if (vistoQuando !== undefined && agora - vistoQuando < JANELA_REPETICAO_MS) continue;
      vistos.set(chave, agora);
      novos.push({ u: u, t: t });
    }
    // mantém o Map leve (remove as chaves mais antigas)
    if (vistos.size > 400) {
      var removidos = 0;
      vistos.forEach(function (_ts, k) {
        if (removidos++ < 200) vistos.delete(k);
      });
    }
    return novos;
  }

  function aoDetectar(novos) {
    for (var i = 0; i < novos.length; i++) {
      var c = novos[i];
      contador++;
      var id = 'ig' + Date.now().toString(36) + '-' + contador;
      var enviado = enviar(c.u, c.t, id);
      if (!enviado) status = 'modo cópia — clique para copiar';
      else status = 'conectado ✓';
      var item = { id: id, u: c.u, t: c.t, enviado: enviado, el: null };
      itens.unshift(item);
      if (itens.length > LIMITE) itens.pop();
      renderItem(item, true);
    }
    if (novos.length) atualizarStatus();
  }

  // ---------- painel ----------
  var painel = document.createElement('div');
  painel.id = ID;
  painel.style = 'position:fixed;top:10px;right:10px;width:320px;height:96vh;background:#1a1a1a;color:white;z-index:9999;padding:10px;font-family:sans-serif;border-left:4px solid #d62976;box-shadow:-5px 0 15px rgba(0,0,0,0.5);display:flex;flex-direction:column;';
  painel.innerHTML =
    "<h3 style='margin:0 0 6px 0;border-bottom:1px solid #444;padding-bottom:5px;font-size:14px;display:flex;align-items:center;justify-content:space-between;gap:6px;'>" +
      "<span>🛍 Monitor de Comentários</span>" +
      "<span id='mc-acoes' style='display:flex;gap:6px;font-size:10px;'>" +
        "<button id='mc-pausar' style='background:#333;color:#fff;border:0;border-radius:3px;padding:2px 6px;cursor:pointer;'>pausar</button>" +
        "<button id='mc-limpar' style='background:#333;color:#fff;border:0;border-radius:3px;padding:2px 6px;cursor:pointer;'>limpar</button>" +
      "</span>" +
    "</h3>" +
    "<div id='mc-status' style='font-size:10px;color:#8f8;margin-bottom:6px;display:flex;justify-content:space-between;'><span id='mc-status-txt'>detectando…</span><span id='mc-status-n'></span></div>" +
    "<div id='mc-lista' style='flex:1;overflow:hidden;'></div>";
  document.body.appendChild(painel);

  var lista = painel.querySelector('#mc-lista');
  var statusTxt = painel.querySelector('#mc-status-txt');
  var statusN = painel.querySelector('#mc-status-n');

  function atualizarStatus() {
    statusTxt.textContent = status;
    statusN.textContent = itens.length + ' comentário(s)';
  }

  function renderItem(item, topo) {
    var i = document.createElement('div');
    i.style = 'margin-bottom:4px;padding:6px 8px;background:#2a2a2a;border-radius:4px;border-left:4px solid #ffdc80;cursor:pointer;user-select:all;';
    i.setAttribute('draggable', 'true');
    i.title = 'Clique: envia ao app + copia. Arraste: plano B.';
    i.innerHTML =
      "<strong style='color:#ffdc80;font-size:16px;display:block;line-height:1.1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'>@" +
        item.u.replace(/</g, '&lt;') + "</strong>" +
      "<span style='font-size:11px;color:#bbb;display:block;line-height:1.1;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'>" +
        item.t.replace(/</g, '&lt;') + "</span>";
    item.el = i;

    i.onclick = function () {
      var enviado = enviar(item.u, item.t, item.id);
      copiar('@' + item.u, function (ok) {
        var antes = i.style.borderLeftColor;
        i.style.borderLeftColor = (enviado && ok) ? '#22c55e' : (ok ? '#ffdc80' : '#666');
        i.setAttribute('data-fb', (enviado ? '✓ enviado ' : '') + (ok ? '✓ copiado' : '✗ falhou'));
        setTimeout(function () {
          i.style.borderLeftColor = antes;
          i.removeAttribute('data-fb');
        }, 1200);
      });
      status = enviado ? 'conectado ✓' : 'modo cópia — clique para copiar';
      atualizarStatus();
    };
    i.ondragstart = function (e) {
      try { e.dataTransfer.setData('text/plain', '@' + item.u); } catch (err) {}
      i.style.opacity = '0.5';
    };
    i.ondragend = function () { i.style.opacity = '1'; };

    if (topo && lista.firstChild) lista.insertBefore(i, lista.firstChild);
    else lista.appendChild(i);
    while (lista.children.length > LIMITE) lista.removeChild(lista.lastChild);
  }

  painel.querySelector('#mc-limpar').onclick = function () {
    itens = [];
    vistos.clear();
    lista.innerHTML = '';
    atualizarStatus();
  };
  painel.querySelector('#mc-pausar').onclick = function (e) {
    pausado = !pausado;
    e.target.textContent = pausado ? 'retomar' : 'pausar';
    status = pausado ? 'pausado ⏸' : (canal === 'copy' ? 'modo cópia' : 'conectado ✓');
    atualizarStatus();
    if (!pausado) varredura();
  };

  // ---------- observador leve (sem setInterval) ----------
  var pendente = false;
  function varredura() {
    if (pausado || pendente) return;
    pendente = true;
    var rodar = function () {
      pendente = false;
      if (pausado) return;
      try { aoDetectar(lerComentarios()); } catch (e) {}
    };
    if (window.requestIdleCallback) requestIdleCallback(rodar, { timeout: 500 });
    else setTimeout(rodar, 120);
  }

  var obs = new MutationObserver(varredura);
  obs.observe(document.body, { childList: true, subtree: true });

  // status inicial
  (function () {
    var w = alvoApp();
    status = w ? 'conectado ✓' : 'modo cópia — clique para copiar';
    atualizarStatus();
  })();

  varredura();
})();
