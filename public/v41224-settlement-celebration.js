// A brief, local-only celebration when opening a completely paid installment schedule.
(() => {
  const colors = ['#10b981', '#f5c451', '#38bdf8', '#fb816d'];
  const message = '🎉 Congratulations! Loan is fully settled.';
  let frame = 0, timer = 0, badge = null, canvas = null, motion = null, owner = null;
  function clear() {
    cancelAnimationFrame(frame); clearTimeout(timer);
    badge?.remove(); canvas?.remove(); badge = canvas = null; owner = null;
    motion?.removeEventListener('change', clear); motion = null;
  }
  function isSettled(data) {
    return data?.status === 'Fully Paid' && data.rows?.length > 0 &&
      data.rows.every(row => row.status === 'Paid');
  }
  function celebrate() {
    clear();
    if (document.hidden || page !== 'installmentDetail' || !stagingData ||
      !document.querySelector('.schedule-card') || !isSettled(loanDisclosureData())) return;
    owner = stagingData.user.id;
    badge = document.createElement('div'); badge.className = 'settlement-toast';
    badge.setAttribute('role', 'status'); badge.setAttribute('aria-live', 'polite');
    badge.textContent = message; document.body.appendChild(badge);
    timer = setTimeout(clear, 4000);
    motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    motion.addEventListener('change', clear);
    if (motion.matches) return;
    const width = window.innerWidth, height = window.innerHeight;
    canvas = document.createElement('canvas'); canvas.className = 'settlement-confetti';
    canvas.setAttribute('aria-hidden', 'true'); document.body.appendChild(canvas);
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext('2d'); if (!ctx) { canvas.remove(); canvas = null; return; }
    ctx.scale(ratio, ratio);
    const count = width < 600 ? 72 : 100, start = performance.now();
    const particles = Array.from({length: count}, (_, i) => {
      const side = i % 2, angle = (-145 + Math.random() * 110) * Math.PI / 180;
      const speed = 4 + Math.random() * 5;
      return {x: width * (side ? .72 : .28), y: Math.min(height * .42, 300),
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        rotation: Math.random() * Math.PI, spin: (Math.random() - .5) * .25,
        size: 5 + Math.random() * 4, color: colors[i % colors.length]};
    });
    let previous = start;
    function draw(now) {
      if (!canvas || document.hidden || page !== 'installmentDetail') { clear(); return; }
      const elapsed = now - start, step = Math.min((now - previous) / 16.667, 2); previous = now;
      ctx.clearRect(0, 0, width, height);
      if (elapsed >= 2400) { canvas.remove(); canvas = null; frame = 0; return; }
      ctx.globalAlpha = Math.min(1, (2400 - elapsed) / 500);
      for (const particle of particles) {
        particle.vx *= Math.pow(.985, step); particle.vy += .12 * step;
        particle.x += particle.vx * step; particle.y += particle.vy * step;
        particle.rotation += particle.spin * step;
        ctx.save(); ctx.translate(particle.x, particle.y); ctx.rotate(particle.rotation);
        ctx.fillStyle = particle.color;
        ctx.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2);
        ctx.restore();
      }
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
  }
  const style = document.createElement('style');
  style.textContent = '.settlement-confetti{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:91}.settlement-toast{position:fixed;left:50%;top:calc(86px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:92;pointer-events:none;box-sizing:border-box;width:max-content;max-width:calc(100% - 28px);padding:12px 16px;border:1px solid #a7e5cc;border-radius:16px;background:#ecfdf5;color:#086747;font-size:13px;font-weight:700;line-height:1.5;text-align:center;box-shadow:0 8px 30px #065f4620}body.dark .settlement-toast{background:#113d31;color:#a7f3d0;border-color:#28745b}';
  document.head.appendChild(style);
  const previousGo = go;
  go = destination => {
    clear(); previousGo(destination);
    if (destination === 'installmentDetail') celebrate();
  };
  // Account sign-out/replacement must remove any remaining badge even without navigation.
  const previousRender = render;
  render = () => {
    if (!stagingData || page !== 'installmentDetail' ||
      (badge && (owner !== stagingData.user.id || !isSettled(loanDisclosureData())))) clear();
    previousRender();
  };
  window.addEventListener('pagehide', clear);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
})();
