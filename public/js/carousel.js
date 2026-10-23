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
  // Distance from center — larger = bigger circle
  const radius = Math.min(320, Math.max(180, window.innerWidth * 0.28));

  let index = 0;
  let timer = null;
  const INTERVAL_MS = 4000;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Place cards around a full 360° circle
  cards.forEach((card, i) => {
    const a = i * angleStep;
    card.style.transform =
      `rotateY(${a}deg) translateZ(${radius}px) rotateY(${-a}deg)`;
  });

  function update() {
    // Spin the whole ring so active card faces the user
    const rotateY = -index * angleStep;
    ring.style.transform = `translateZ(-${radius * 0.15}px) rotateY(${rotateY}deg)`;

    cards.forEach((card, i) => {
      const active = i === index;
      card.setAttribute('aria-hidden', active ? 'false' : 'true');
      card.style.opacity = active ? '1' : '0.45';
      card.style.filter = active ? 'none' : 'blur(0.5px)';
    });

    if (dotsWrap) {
      dotsWrap.querySelectorAll('.gtb-carousel-360__dot').forEach((dot, di) => {
        dot.setAttribute('aria-current', di === index ? 'true' : 'false');
      });
    }
  }

  function goTo(i) {
    index = ((i % n) + n) % n;
    update();
  }

  function next() { goTo(index + 1); }
  function prev() { goTo(index - 1); }

  function startAuto() {
    if (reduceMotion || n < 2) return;
    stopAuto();
    timer = setInterval(next, INTERVAL_MS);
  }

  function stopAuto() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  if (dotsWrap) {
    cards.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'gtb-carousel-360__dot';
      dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
      dot.addEventListener('click', () => {
        goTo(i);
        startAuto();
      });
      dotsWrap.appendChild(dot);
    });
  }

  prevBtn?.addEventListener('click', () => { prev(); startAuto(); });
  nextBtn?.addEventListener('click', () => { next(); startAuto(); });

  root.addEventListener('mouseenter', stopAuto);
  root.addEventListener('mouseleave', startAuto);

  // Drag / swipe to rotate
  let startX = null;
  const onStart = (x) => { startX = x; stopAuto(); };
  const onEnd = (x) => {
    if (startX == null) return;
    const dx = x - startX;
    if (Math.abs(dx) > 40) (dx < 0 ? next : prev)();
    startX = null;
    startAuto();
  };

  stage?.addEventListener('pointerdown', (e) => onStart(e.clientX));
  window.addEventListener('pointerup', (e) => {
    if (startX != null) onEnd(e.clientX);
  });

  goTo(0);
  startAuto();
})();