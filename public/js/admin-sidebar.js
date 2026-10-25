
(function () {
  'use strict';

  function initAdminSidebar() {
    const sidebar = document.getElementById('db-sidebar');
    const button = document.querySelector('.db-hamburger');
    const backdrop = document.querySelector('.db-sidebar-backdrop');

    if (!sidebar || !button || !backdrop) {
      return;
    }

    // Prevent duplicate event listeners.
    if (button.dataset.sidebarInitialized === 'true') {
      return;
    }

    button.dataset.sidebarInitialized = 'true';

    const mobileQuery = window.matchMedia('(max-width: 768px)');

    function setSidebar(open) {
      const shouldOpen = Boolean(open) && mobileQuery.matches;

      document.body.classList.toggle('db-sidebar-open', shouldOpen);

      button.setAttribute('aria-expanded', String(shouldOpen));
      button.setAttribute(
        'aria-label',
        shouldOpen ? 'Close navigation menu' : 'Open navigation menu'
      );

      backdrop.setAttribute('aria-hidden', String(!shouldOpen));

      // Keep keyboard focus and the background page usable.
      if (mobileQuery.matches) {
        sidebar.inert = !shouldOpen;
      } else {
        sidebar.inert = false;
      }
    }

    button.addEventListener('click', function () {
      const isOpen = document.body.classList.contains('db-sidebar-open');
      setSidebar(!isOpen);
    });

    backdrop.addEventListener('click', function () {
      setSidebar(false);
    });

    sidebar.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        if (mobileQuery.matches) {
          setSidebar(false);
        }
      });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        setSidebar(false);
        button.focus();
      }

      if (
        event.key === 'Tab' &&
        mobileQuery.matches &&
        document.body.classList.contains('db-sidebar-open')
      ) {
        const focusable = sidebar.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );

        if (!focusable.length) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          document.activeElement === last
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    });

    function handleViewportChange() {
      setSidebar(false);
      sidebar.inert = mobileQuery.matches;
    }

    if (mobileQuery.addEventListener) {
      mobileQuery.addEventListener('change', handleViewportChange);
    } else {
      mobileQuery.addListener(handleViewportChange);
    }

    setSidebar(false);
    sidebar.inert = mobileQuery.matches;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminSidebar);
  } else {
    initAdminSidebar();
  }
})();
