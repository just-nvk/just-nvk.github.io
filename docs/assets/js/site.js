// 1. Просмотр слайдов крупно. Без JS ссылки просто открывают картинку.
(() => {
  const links = Array.from(document.querySelectorAll('[data-lightbox]'));
  if (!links.length || typeof HTMLDialogElement !== 'function') return;

  const icon = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  const dlg = document.createElement('dialog');
  dlg.className = 'lb';
  dlg.setAttribute('aria-label', 'Просмотр слайдов');
  dlg.innerHTML = `
    <figure class="lb__fig"><img class="lb__img" alt=""><figcaption class="lb__cap" aria-live="polite"></figcaption></figure>
    <button class="lb__btn lb__prev" type="button" aria-label="Предыдущий слайд">${icon('M15 18l-6-6 6-6')}</button>
    <button class="lb__btn lb__next" type="button" aria-label="Следующий слайд">${icon('M9 18l6-6-6-6')}</button>
    <button class="lb__btn lb__close" type="button" aria-label="Закрыть">${icon('M18 6L6 18M6 6l12 12')}</button>`;
  document.body.append(dlg);

  const img = dlg.querySelector('.lb__img');
  const cap = dlg.querySelector('.lb__cap');
  let index = 0;

  const show = (n) => {
    index = (n + links.length) % links.length;
    const a = links[index];
    img.src = a.href;
    img.alt = a.querySelector('img')?.alt || '';
    cap.textContent = `${index + 1} / ${links.length} · ${a.dataset.caption || ''}`;
  };
  const close = () => dlg.close();

  links.forEach((a, n) => a.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    show(n);
    dlg.showModal();
    document.documentElement.classList.add('lb-open');
  }));
  dlg.addEventListener('close', () => {
    document.documentElement.classList.remove('lb-open');
    links[index]?.focus();
  });
  dlg.querySelector('.lb__prev').addEventListener('click', () => show(index - 1));
  dlg.querySelector('.lb__next').addEventListener('click', () => show(index + 1));
  dlg.querySelector('.lb__close').addEventListener('click', close);
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.classList.contains('lb__fig')) close(); });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') show(index - 1);
    if (e.key === 'ArrowRight') show(index + 1);
  });

  let startX = null;
  dlg.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
  dlg.addEventListener('touchend', (e) => {
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 40) show(index + (dx < 0 ? 1 : -1));
    startX = null;
  });
})();

// 2. Видео в кейсе играет без звука, пока его видно, и встаёт на паузу за экраном.
// Если посетитель сам поставил паузу или в системе включено «уменьшить движение», видео не запускается само.
(() => {
  const videos = Array.from(document.querySelectorAll('video[data-autoplay]'));
  if (!videos.length || !('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const state = new Map(videos.map((v) => [v, { visible: false, userPaused: false, auto: false }]));
  videos.forEach((v) => {
    const s = state.get(v);
    v.addEventListener('pause', () => {
      if (!s.auto && s.visible) s.userPaused = true;
      s.auto = false;
    });
    v.addEventListener('play', () => { s.userPaused = false; });
  });

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const v = e.target;
      const s = state.get(v);
      s.visible = e.isIntersecting && e.intersectionRatio >= 0.5;
      if (s.visible && v.paused && !s.userPaused) {
        v.play().catch(() => {});
      } else if (!s.visible && !v.paused) {
        s.auto = true;
        v.pause();
      }
    }
  }, { threshold: [0, 0.5] });
  videos.forEach((v) => io.observe(v));
})();
