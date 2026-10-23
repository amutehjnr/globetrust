(() => {
  'use strict';
  const track = document.querySelector('.gtb-flags-wm__track');
  if (!track) return;

  // If CSS animation is already moving, leave it alone
  const cs = getComputedStyle(track);
  if (cs.animationName && cs.animationName !== 'none' && cs.animationPlayState === 'running') {
    // Still force a faster JS scroll if you prefer always-on control:
    // track.style.animation = 'none';
  }

  // Reliable pixel scroll (works even when CSS animation is disabled)
  track.style.animation = 'none';
  let x = 0;
  const speed = 40; // px per second — raise for faster

  function loop(ts) {
    if (!loop.last) loop.last = ts;
    const dt = (ts - loop.last) / 1000;
    loop.last = ts;

    const half = track.scrollWidth / 2;
    if (half > 0) {
      x -= speed * dt;
      if (x <= -half) x += half;
      track.style.transform = 'translate3d(' + x + 'px,0,0)';
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();