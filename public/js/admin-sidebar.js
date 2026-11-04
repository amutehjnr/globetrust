'use strict';

(function () {
  function initAdminSidebar() {
    var sidebar = document.getElementById('db-sidebar');
    var button = document.querySelector('.db-hamburger');
    var backdrop = document.querySelector('.db-sidebar-backdrop');
    if (!sidebar || !button || !backdrop) return;
    if (button.getAttribute('data-ready') === '1') return;
    button.setAttribute('data-ready', '1');

    var mq = window.matchMedia('(max-width: 900px)');

    function setOpen(open) {
      var should = Boolean(open) && mq.matches;
      document.body.classList.toggle('db-sidebar-open', should);
      button.setAttribute('aria-expanded', should ? 'true' : 'false');
      backdrop.setAttribute('aria-hidden', should ? 'false' : 'true');
    }

    button.addEventListener('click', function () {
      setOpen(!document.body.classList.contains('db-sidebar-open'));
    });
    backdrop.addEventListener('click', function () {
      setOpen(false);
    });
    sidebar.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        if (mq.matches) setOpen(false);
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });
    function onChange() {
      setOpen(false);
    }
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
    setOpen(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminSidebar);
  } else {
    initAdminSidebar();
  }
})();