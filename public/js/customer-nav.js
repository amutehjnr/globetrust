'use strict';

(function () {
  var shell = document.querySelector('.db-shell');
  var sidebar = document.getElementById('db-sidebar');
  var backdrop = document.getElementById('db-nav-backdrop');
  var openBtn = document.getElementById('db-nav-open');
  var closeBtn = document.getElementById('db-nav-close');
  if (!shell || !sidebar) return;

  function openNav() {
    shell.classList.add('nav-open');
    if (backdrop) backdrop.hidden = false;
    if (openBtn) openBtn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('db-nav-lock');
  }

  function closeNav() {
    shell.classList.remove('nav-open');
    if (backdrop) backdrop.hidden = true;
    if (openBtn) openBtn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('db-nav-lock');
  }

  if (openBtn) openBtn.addEventListener('click', openNav);
  if (closeBtn) closeBtn.addEventListener('click', closeNav);
  if (backdrop) backdrop.addEventListener('click', closeNav);

  sidebar.querySelectorAll('a.db-nav-item').forEach(function (link) {
    link.addEventListener('click', function () {
      if (window.matchMedia('(max-width: 900px)').matches) closeNav();
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeNav();
  });

  window.addEventListener('resize', function () {
    if (window.matchMedia('(min-width: 901px)').matches) closeNav();
  });
})();