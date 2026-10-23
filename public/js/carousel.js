(() => {
  'use strict';

  const root = document.querySelector('[data-gtb-carousel]');
  if (!root) return;

  const track = root.querySelector('.gtb-carousel__track');
  const slides = Array.from(root.querySelectorAll('.gtb-carousel__slide'));
  const prevBtn = root.querySelector('[data-carousel-prev]');
  const nextBtn = root.querySelector('[data-carousel-next]');
  const dotsWrap = root.querySelector('.gtb-carousel__dots');
  if (!track || slides.length === 0) return;

  let index = 0;
  let timer = null;
  const INTERVAL_MS = 5500;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function goTo(i) {
    index = (i + slides.length) % slides.length;
    track.style.transform = `translateX(-${index * 100}%)`;
    if (dotsWrap) {
      dotsWrap.querySelectorAll('.gtb-carousel__dot').forEach((dot, di) => {
        dot.setAttribute('aria-current', di === index ? 'true' : 'false');
      });
    }
    slides.forEach((slide, si) => {
      slide.setAttribute('aria-hidden', si === index ? 'false' : 'true');
    });
  }

  function next() { goTo(index + 1); }
  function prev() { goTo(index - 1); }

  function startAuto() {
    if (reduceMotion || slides.length < 2) return;
    stopAuto();
    timer = setInterval(next, INTERVAL_MS);
  }

  function stopAuto() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  // Dots
  if (dotsWrap) {
    slides.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'gtb-carousel__dot';
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
  root.addEventListener('focusin', stopAuto);
  root.addEventListener('focusout', (e) => {
    if (!root.contains(e.relatedTarget)) startAuto();
  });

  // Touch swipe
  let touchX = null;
  track.addEventListener('touchstart', (e) => {
    touchX = e.changedTouches[0].screenX;
    stopAuto();
  }, { passive: true });
  track.addEventListener('touchend', (e) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].screenX - touchX;
    if (Math.abs(dx) > 40) (dx < 0 ? next : prev)();
    touchX = null;
    startAuto();
  }, { passive: true });

  goTo(0);
  startAuto();
})();