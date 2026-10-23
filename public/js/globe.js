/**
 * Globe Trust Bank — animated canvas globe.
 * Larger, brighter, with a soft pulse. Respects prefers-reduced-motion.
 */
(function () {
  const canvas = document.getElementById('globe-canvas');
  const fallback = document.getElementById('globe-fallback');
  if (!canvas || !canvas.getContext) {
    if (fallback) fallback.classList.add('is-visible');
    return;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    if (fallback) fallback.classList.add('is-visible');
    return;
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0;
  let angle = 0;

  const stars = [];
  for (let i = 0; i < 70; i++) {
    stars.push({
      x: Math.random(), y: Math.random(),
      r: Math.random() * 1.4 + 0.3,
      a: Math.random() * 0.6 + 0.2,
      tw: Math.random() * Math.PI * 2,
    });
  }

  function resize() {
    const parent = canvas.parentElement;
    const w = parent ? parent.clientWidth : 640;
    const h = Math.max(300, Math.min(520, Math.round(w * 0.62)));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(t) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) * 0.36;
    const pulse = 1 + Math.sin((t || 0) * 0.0006) * 0.02;

    stars.forEach((s) => {
      const twinkle = 0.6 + Math.sin((t || 0) * 0.001 + s.tw) * 0.4;
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(220, 207, 182, ${s.a * twinkle})`;
      ctx.fill();
    });

    const glow = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.55 * pulse);
    glow.addColorStop(0, 'rgba(195, 180, 156, 0.3)');
    glow.addColorStop(0.55, 'rgba(195, 180, 156, 0.1)');
    glow.addColorStop(1, 'rgba(16, 26, 48, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.55 * pulse, 0, Math.PI * 2);
    ctx.fill();

    const grd = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.45, r * 0.1, cx, cy, r);
    grd.addColorStop(0, '#526787');
    grd.addColorStop(0.5, '#2b3d5e');
    grd.addColorStop(1, '#0f1d33');
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();

    ctx.strokeStyle = 'rgba(220, 207, 182, 0.75)';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 253, 249, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 3, 0, Math.PI * 2);
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(220, 207, 182, 0.24)';
    ctx.lineWidth = 1;

    for (let i = -2; i <= 2; i++) {
      const lat = (i / 3) * r;
      const rx = r * Math.sqrt(Math.max(0.05, 1 - (lat / r) ** 2));
      ctx.beginPath();
      ctx.ellipse(cx, cy + lat * 0.16, rx, r * 0.16, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < 6; i++) {
      const a = angle + (i * Math.PI) / 6;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * Math.abs(Math.cos(a)) * 0.95 + 2, r, a * 0.15, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    const hl = ctx.createRadialGradient(cx - r * 0.32, cy - r * 0.38, 0, cx - r * 0.32, cy - r * 0.38, r * 0.55);
    hl.addColorStop(0, 'rgba(255, 253, 249, 0.28)');
    hl.addColorStop(1, 'rgba(255, 253, 249, 0)');
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.32, cy - r * 0.38, r * 0.3, r * 0.2, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = hl;
    ctx.fill();

    if (!reduceMotion) {
      angle += 0.004;
      raf = requestAnimationFrame(draw);
    }
  }

  function start() {
    resize();
    cancelAnimationFrame(raf);
    if (reduceMotion) draw(0);
    else raf = requestAnimationFrame(draw);
  }

  window.addEventListener('resize', start, { passive: true });
  start();
})();