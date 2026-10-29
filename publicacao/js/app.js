(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const TELAS = (window.TELAS || []).map((t) => ({ ...t, src: `img/prints/${t.id}.webp` }));

  // ------------------------------------------------------------------ menu e topo
  const topo = $('.topo');
  const aoRolar = () => topo.classList.toggle('rolou', window.scrollY > 8);
  window.addEventListener('scroll', aoRolar, { passive: true });
  aoRolar();

  const menuBtn = $('.menu-btn');
  const menu = $('#menu');
  menuBtn.addEventListener('click', () => {
    const aberto = menu.classList.toggle('aberto');
    menuBtn.setAttribute('aria-expanded', String(aberto));
  });
  $$('#menu a').forEach((a) => a.addEventListener('click', () => {
    menu.classList.remove('aberto');
    menuBtn.setAttribute('aria-expanded', 'false');
  }));

  // ------------------------------------------------------------------ visor de telas
  const visor = $('[data-visor]');
  const cheia = $('[data-tela-cheia]');
  let atual = 0;

  if (visor && TELAS.length) {
    const img = $('[data-img]', visor);
    const titulo = $('[data-titulo]', visor);
    const descricao = $('[data-descricao]', visor);
    const contador = $('[data-contador]', visor);
    const minis = $('[data-miniaturas]', visor);
    const grupos = $('[data-grupos]', visor);

    // botões de grupo (Painel, Conexões, Tarefas...)
    const nomesGrupos = [...new Set(TELAS.map((t) => t.grupo))];
    nomesGrupos.forEach((g) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.textContent = g;
      b.dataset.grupo = g;
      b.addEventListener('click', () => mostrar(TELAS.findIndex((t) => t.grupo === g), true));
      grupos.appendChild(b);
    });

    // miniaturas
    TELAS.forEach((t, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mini';
      b.setAttribute('aria-label', `${i + 1}. ${t.titulo}`);
      b.innerHTML = `<img src="${t.src}" alt="" loading="lazy" width="144" height="90"><span>${t.titulo}</span>`;
      b.addEventListener('click', () => mostrar(i, true));
      minis.appendChild(b);
    });

    function mostrar(i, rolarMini) {
      atual = (i + TELAS.length) % TELAS.length;
      const t = TELAS[atual];
      img.classList.add('trocando');
      const pre = new Image();
      pre.onload = pre.onerror = () => {
        img.src = t.src;
        img.alt = t.titulo;
        img.classList.remove('trocando');
      };
      pre.src = t.src;
      titulo.textContent = t.titulo;
      descricao.textContent = t.descricao;
      contador.textContent = `${atual + 1} / ${TELAS.length}`;
      $$('.mini', minis).forEach((m, k) => m.classList.toggle('ativa', k === atual));
      $$('button', grupos).forEach((g) => g.setAttribute('aria-selected', String(g.dataset.grupo === t.grupo)));
      if (rolarMini) {
        const m = $$('.mini', minis)[atual];
        minis.scrollTo({ left: m.offsetLeft - minis.clientWidth / 2 + m.clientWidth / 2, behavior: 'smooth' });
      }
      // pré-carrega as vizinhas
      [atual + 1, atual - 1].forEach((k) => { new Image().src = TELAS[(k + TELAS.length) % TELAS.length].src; });
      if (!cheia.hidden) atualizarCheia();
      if (rolarMini && history.replaceState) history.replaceState(null, '', '#tela-' + t.id);
    }

    $('[data-ant]', visor).addEventListener('click', () => mostrar(atual - 1, true));
    $('[data-prox]', visor).addEventListener('click', () => mostrar(atual + 1, true));
    $('[data-cheia]', visor).addEventListener('click', abrirCheia);

    // teclado quando o visor está visível
    let visorVisivel = false;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((e) => { visorVisivel = e[0].isIntersecting; }, { threshold: 0.35 }).observe(visor);
    }
    document.addEventListener('keydown', (e) => {
      if (!cheia.hidden) {
        if (e.key === 'Escape') fecharCheia();
        else if (e.key === 'ArrowRight') { e.preventDefault(); mostrar(atual + 1, true); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); mostrar(atual - 1, true); }
        return;
      }
      if (!visorVisivel || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); mostrar(atual + 1, true); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); mostrar(atual - 1, true); }
    });

    // deslizar o dedo (visor e tela cheia)
    const deslizar = (el) => {
      let x0 = null;
      el.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
      el.addEventListener('touchend', (e) => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0;
        x0 = null;
        if (Math.abs(dx) > 45) mostrar(atual + (dx < 0 ? 1 : -1), true);
      });
    };
    deslizar($('.visor-palco', visor));
    deslizar(cheia);

    // ---------------------------------------------------------------- tela cheia
    const cheiaImg = $('[data-img]', cheia);
    function atualizarCheia() {
      const t = TELAS[atual];
      cheiaImg.src = t.src;
      cheiaImg.alt = t.titulo;
      $('[data-titulo]', cheia).textContent = t.titulo;
      $('[data-contador]', cheia).textContent = `· ${atual + 1} / ${TELAS.length}`;
    }
    let focoAnterior = null;
    function abrirCheia() {
      focoAnterior = document.activeElement;
      atualizarCheia();
      cheia.hidden = false;
      document.body.style.overflow = 'hidden';
      $('[data-prox]', cheia).focus();
    }
    function fecharCheia() {
      cheia.hidden = true;
      document.body.style.overflow = '';
      if (focoAnterior) focoAnterior.focus();
    }
    $('[data-ant]', cheia).addEventListener('click', (e) => { e.stopPropagation(); mostrar(atual - 1, true); });
    $('[data-prox]', cheia).addEventListener('click', (e) => { e.stopPropagation(); mostrar(atual + 1, true); });
    $('[data-fechar]', cheia).addEventListener('click', fecharCheia);
    cheiaImg.addEventListener('click', (e) => { e.stopPropagation(); mostrar(atual + 1, true); });
    cheia.addEventListener('click', (e) => { if (e.target === cheia) fecharCheia(); });

    // abrir uma tela a partir de outros botões da página
    function irPara(id, emCheia) {
      const i = TELAS.findIndex((t) => t.id === id);
      if (i < 0) return;
      mostrar(i, true);
      if (emCheia) abrirCheia();
      else document.getElementById('telas').scrollIntoView({ behavior: 'smooth' });
    }
    $$('[data-ir]').forEach((b) => b.addEventListener('click', () => irPara(b.dataset.ir)));
    $$('[data-abrir]').forEach((b) => b.addEventListener('click', () => { mostrar(Number(b.dataset.abrir), false); abrirCheia(); }));

    // link direto: index.html#tela-06-historico
    const telaDoHash = () => {
      const m = /^#tela-(.+)$/.exec(location.hash);
      return m && TELAS.some((t) => t.id === m[1]) ? m[1] : null;
    };
    if (telaDoHash()) irPara(telaDoHash());
    else mostrar(0, false);
    window.addEventListener('hashchange', () => { const id = telaDoHash(); if (id && TELAS[atual].id !== id) irPara(id); });
  }

  // ------------------------------------------------------------------ abas do "Como usar"
  const abas = $$('[data-aba]');
  function ativarAba(aba, focar) {
    abas.forEach((a) => {
      const ativa = a === aba;
      a.setAttribute('aria-selected', String(ativa));
      a.tabIndex = ativa ? 0 : -1;
      document.getElementById(a.getAttribute('aria-controls')).hidden = !ativa;
    });
    if (focar) aba.focus();
  }
  abas.forEach((a, i) => {
    a.addEventListener('click', () => ativarAba(a));
    a.addEventListener('keydown', (e) => {
      const passo = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!passo) return;
      e.preventDefault();
      ativarAba(abas[(i + passo + abas.length) % abas.length], true);
    });
  });

  // ------------------------------------------------------------------ animação de entrada
  const alvos = $$('.passos li, .cartao, .recurso, .faq details');
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const io = new IntersectionObserver((ents) => ents.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('visivel'); io.unobserve(en.target); }
    }), { rootMargin: '0px 0px -40px 0px' });
    alvos.forEach((el) => { el.classList.add('revelar'); io.observe(el); });
  }

  const ano = $('[data-ano]');
  if (ano) ano.textContent = String(new Date().getFullYear());
})();
