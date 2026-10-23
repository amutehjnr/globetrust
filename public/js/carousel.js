
(() => {
  'use strict';

  function initCarousel() {
    const root = document.querySelector('[data-gtb-carousel-360]');
    if (!root || root.dataset.carouselInitialized === 'true') return;

    const ring = root.querySelector('.gtb-carousel-360__ring');
    const cards = Array.from(root.querySelectorAll('.gtb-carousel-360__card'));
    const prevBtn = root.querySelector('[data-carousel-prev]');
    const nextBtn = root.querySelector('[data-carousel-next]');
    const dotsWrap = root.querySelector('.gtb-carousel-360__dots');
    const stage = root.querySelector('.gtb-carousel-360__stage');

    const count = cards.length;
    if (!ring || !stage || count === 0) return;

    root.dataset.carouselInitialized = 'true';

    const angleStep = 360 / count;
    const DEGREES_PER_SEC = 30;
    let rotation = 0;
    let activeIndex = 0;
    let lastTimestamp = null;
    let animationFrame = null;
    let startX = null;

    function getRadius() {
      const width = stage.clientWidth;
      const cardWidth = Math.min(260, width * 0.72);

      // Keep enough room for the cards on narrow screens.
      return Math.max(110, Math.min(320, width * 0.42, cardWidth * 1.05));
    }

    let radius = getRadius();

    function positionCards() {
      radius = getRadius();

      cards.forEach((card, i) => {
        const angle = i * angleStep;
        card.style.transform =
          `rotateY(${angle}deg) translateZ(${radius}px) rotateY(${-angle}deg)`;
      });

      paint();
    }

    function getNearestIndex() {
      const normalized = ((-rotation % 360) + 360) % 360;
      return Math.round(normalized / angleStep) % count;
    }

    function paint() {
      ring.style.transform =
        `translateZ(-${radius * 0.15}px) rotateY(${rotation}deg)`;

      activeIndex = getNearestIndex();

      cards.forEach((card, i) => {
        const active = i === activeIndex;
        card.setAttribute('aria-hidden', active ? 'false' : 'true');
        card.style.opacity = active ? '1' : '0.5';
        card.style.zIndex = active ? '2' : '1';
      });

      if (dotsWrap) {
        dotsWrap.querySelectorAll('.gtb-carousel-360__dot')
          .forEach((dot, i) => {
            dot.setAttribute(
              'aria-current',
              i === activeIndex ? 'true' : 'false'
            );
          });
      }
    }

    function snapTo(index) {
      const target = ((index % count) + count) % count;
      rotation = -target * angleStep;
      paint();

      // Automatic rotation continues immediately after manual navigation.
      lastTimestamp = null;
    }

    if (dotsWrap) {
      dotsWrap.replaceChildren();

      cards.forEach((_, i) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'gtb-carousel-360__dot';
        dot.setAttribute('aria-label', `Go to slide ${i + 1}`);

        dot.addEventListener('click', () => snapTo(i));
        dotsWrap.appendChild(dot);
      });
    }

    prevBtn?.addEventListener('click', () => snapTo(activeIndex - 1));
    nextBtn?.addEventListener('click', () => snapTo(activeIndex + 1));

    // Optional swipe navigation. It never pauses the automatic rotation.
    stage.addEventListener('pointerdown', (event) => {
      startX = event.clientX;
    });

    stage.addEventListener('pointerup', (event) => {
      if (startX === null) return;

      const distance = event.clientX - startX;
      startX = null;

      if (Math.abs(distance) > 40) {
        snapTo(activeIndex + (distance < 0 ? 1 : -1));
      }
    });

    stage.addEventListener('pointercancel', () => {
      startX = null;
    });

    function tick(timestamp) {
      if (lastTimestamp === null) lastTimestamp = timestamp;

      const elapsed = Math.min((timestamp - lastTimestamp) / 1000, 0.1);
      lastTimestamp = timestamp;

      // Always rotate: no hover, focus, or reduced-motion pause.
      rotation -= DEGREES_PER_SEC * elapsed;
      paint();

      animationFrame = requestAnimationFrame(tick);
    }

    // Recalculate the carousel radius when the viewport changes.
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(positionCards, 100);
    });

    positionCards();
    animationFrame = requestAnimationFrame(tick);

    window.addEventListener('pagehide', () => {
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }
      clearTimeout(resizeTimer);
    }, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCarousel, { once: true });
  } else {
    initCarousel();
  }
})();
