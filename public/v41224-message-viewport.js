// Keep the full-page chat composer above navigation and the visible keyboard edge.
(() => {
  let scheduled = false;
  function fitMessages() {
    scheduled = false;
    const card = document.querySelector('#app .chat-card');
    if (!card || document.getElementById('deviceHolder')?.dataset.device !== 'actualweb') return;
    const viewport = window.visualViewport;
    const visibleBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
    const nav = document.getElementById('nav');
    const navTop = nav && !nav.classList.contains('hidden') ? nav.getBoundingClientRect().top : visibleBottom;
    const orb = document.getElementById('dashboardOrbitTrigger')?.getBoundingClientRect();
    const bottom = Math.min(visibleBottom, navTop, orb?.height ? orb.top : visibleBottom);
    const available = Math.floor(bottom - card.getBoundingClientRect().top - 12);
    if (available > 0) {
      card.style.setProperty('--chat-available-height', available + 'px');
      card.classList.toggle('chat-viewport-tight', available < 320);
      card.classList.toggle('chat-viewport-compact', available < 160);
    }
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(fitMessages);
  }
  const previousRender = render;
  render = function(...args) {
    const result = previousRender.apply(this, args);
    schedule();
    return result;
  };
  window.addEventListener('resize', schedule, {passive: true});
  window.visualViewport?.addEventListener('resize', schedule, {passive: true});
  window.visualViewport?.addEventListener('scroll', schedule, {passive: true});
  schedule();
})();
