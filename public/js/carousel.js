(() => {
  'use strict';

  const root = document.querySelector('[data-gtb-carousel-360]');
  if (!root) return;

  const ring = root.querySelector('.gtb-carousel-360__ring');
  const cards = Array.from(root.querySelectorAll('.gtb-carousel-360__card'));
  if (!ring || cards.length === 0) return;

  const n = cards.length;
  const angleStep = 360 / n;
  const radius = Math.min(280, Math.max(160, window.innerWidth * 0.26));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Continuous auto spin — starts immediately, no click needed
  const DEGREES_PER_SEC = 22; // ~16s per full 360°
  let rotation = 0;
  let lastTs = null;
  let rafId = null;

  cards.forEach((card, i) => {
    const a = i * angleStep;
    card.style.transform =
      `rotateY(${a}deg) translateZ(${radius}px) rotateY(${-a}deg)`;
    card.setAttribute('aria-hidden', 'true');
  });

  function paint() {
    ring.style.transform =
      `translateZ(-${radius * 0.12}px) rotateY(${rotation}deg)`;
  }

  function tick(ts) {
    if (lastTs == null) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000); // clamp large gaps
    lastTs = ts;

    rotation -= DEGREES_PER_SEC * dt;
    paint();
    rafId = requestAnimationFrame(tick);
  }

  // Accessibility: do not animate if user prefers reduced motion
  if (reduceMotion) {
    paint();
    return;
  }

  paint();
  rafId = requestAnimationFrame(tick); // auto-start — no button required

  window.addEventListener('beforeunload', () => {
    if (rafId) cancelAnimationFrame(rafId);
  }, { once: true });
})();