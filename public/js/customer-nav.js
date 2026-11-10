'use strict';

(function () {
  var shell = document.querySelector('.db-shell');
  var sidebar = document.getElementById('db-sidebar');
  var backdrop = document.getElementById('db-nav-backdrop') || document.querySelector('.db-nav-backdrop');
  var openBtn = document.getElementById('db-nav-open') || document.querySelector('.db-menu-toggle');
  var closeBtn = document.getElementById('db-nav-close') || document.querySelector('.db-sidebar__close');

  if (!shell || !sidebar) return;

  function isMobile() {
    return window.matchMedia('(max-width: 900px)').matches;
  }

  function openNav() {
    shell.classList.add('nav-open');
    document.body.classList.add('db-nav-lock');
    if (backdrop) {
      backdrop.hidden = false;
      backdrop.removeAttribute('hidden');
      backdrop.setAttribute('aria-hidden', 'false');
    }
    if (openBtn) openBtn.setAttribute('aria-expanded', 'true');
    sidebar.removeAttribute('inert');
    sidebar.style.pointerEvents = 'auto';
  }

  function closeNav() {
    shell.classList.remove('nav-open');
    document.body.classList.remove('db-nav-lock');
    if (backdrop) {
      backdrop.hidden = true;
      backdrop.setAttribute('aria-hidden', 'true');
    }
    if (openBtn) openBtn.setAttribute('aria-expanded', 'false');
  }

  if (openBtn) {
    openBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (shell.classList.contains('nav-open')) closeNav();
      else openNav();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      closeNav();
    });
  }

  if (backdrop) {
    backdrop.addEventListener('click', function (e) {
      e.preventDefault();
      closeNav();
    });
  }

  // CRITICAL: do not close the drawer in the same event as the link click.
  // Closing/transforming the sidebar immediately cancels navigation on mobile Safari/Chrome.
  sidebar.querySelectorAll('a[href]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      // Never preventDefault on real links
      if (!isMobile()) return;
      var href = link.getAttribute('href');
      if (!href || href === '#') return;
      // Let the browser navigate; close a bit later as a soft cleanup
      setTimeout(function () {
        closeNav();
      }, 400);
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeNav();
  });

  window.addEventListener('resize', function () {
    if (!isMobile()) closeNav();
  });
})();