(() => {
  'use strict';

  const root = document.querySelector('[data-gtb-carousel-360]');
  if (!root) return;

  const ring = root.querySelector('.gtb-carousel-360__ring');
  const cards = Array.from(root.querySelectorAll('.gtb-carousel-360__card'));
  const prevBtn = root.querySelector('[data-carousel-prev]');
  const nextBtn = root.querySelector('[data-carousel-next]');
  const dotsWrap = root.querySelector('.gtb-carousel-360__dots');
  const stage = root.querySelector('.gtb-carousel-360__stage');

  const n = cards.length;
  if (!ring || n === 0) return;

  const angleStep = 360 / n;
  const radius = Math.min(320, Math.max(180, window.innerWidth * 0.28));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Degrees per second — full 360° every ~12 seconds
  const DEGREES_PER_SEC = 30;
  let rotation = 0;      // continuous angle
  let index = 0;         // nearest card for dots/aria
  let paused = false;
  let lastTs = null;
  let rafId = null;

  cards.forEach((card, i) => {
    const a = i * angleStep;
    card.style.transform =
      `rotateY(${a}deg) translateZ(${radius}px) rotateY(${-a}deg)`;
  });

  function nearestIndex() {
    // Which card is facing the camera (0° front)
    const normalized = ((-rotation % 360) + 360) % 360;
    return Math.round(normalized / angleStep) % n;
  }

  function paint() {
    ring.style.transform = `translateZ(-${radius * 0.15}px) rotateY(${rotation}deg)`;

    index = nearestIndex();
    cards.forEach((card, i) => {
      const active = i === index;
      card.setAttribute('aria-hidden', active ? 'false' : 'true');
      card.style.opacity = active ? '1' : '0.5';
    });

    if (dotsWrap) {
      dotsWrap.querySelectorAll('.gtb-carousel-360__dot').forEach((dot, di) => {
        dot.setAttribute('aria-current', di === index ? 'true' : 'false');
      });
    }
  }

  function tick(ts) {
    if (lastTs == null) lastTs = ts;
    const dt = (ts - lastTs) / 1000;
    lastTs = ts;

    if (!paused && !reduceMotion) {
      // Negative = spin so next cards come from the right
      rotation -= DEGREES_PER_SEC * dt;
    }

    paint();
    rafId = requestAnimationFrame(tick);
  }

  function snapTo(i) {
    index = ((i % n) + n) % n;
    // Face that card toward the user
    rotation = -index * angleStep;
    paint();
  }

  if (dotsWrap) {
    cards.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'gtb-carousel-360__dot';
      dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
      dot.addEventListener('click', () => snapTo(i));
      dotsWrap.appendChild(dot);
    });
  }

  prevBtn?.addEventListener('click', () => snapTo(index - 1));
  nextBtn?.addEventListener('click', () => snapTo(index + 1));

  // Pause auto-spin while hovering / focusing / dragging
  root.addEventListener('mouseenter', () => { paused = true; });
  root.addEventListener('mouseleave', () => { paused = false; lastTs = null; });
  root.addEventListener('focusin', () => { paused = true; });
  root.addEventListener('focusout', (e) => {
    if (!root.contains(e.relatedTarget)) {
      paused = false;
      lastTs = null;
    }
  });

  let startX = null;
  stage?.addEventListener('pointerdown', (e) => {
    startX = e.clientX;
    paused = true;
  });
  window.addEventListener('pointerup', (e) => {
    if (startX == null) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 40) snapTo(index + (dx < 0 ? 1 : -1));
    startX = null;
    paused = false;
    lastTs = null;
  });

  // Reduced motion: no continuous spin — only show first card
  if (reduceMotion) {
    snapTo(0);
    return;
  }

  paint();
  rafId = requestAnimationFrame(tick);

  window.addEventListener('beforeunload', () => {
    if (rafId) cancelAnimationFrame(rafId);
  }, { once: true });
})();