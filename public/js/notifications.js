(function () {
  var root = document.getElementById('db-notify');
  if (!root) return;

  var btn = document.getElementById('db-notify-btn');
  var panel = document.getElementById('db-notify-panel');
  var list = document.getElementById('db-notify-list');
  var badge = document.getElementById('db-notify-badge');
  var markAll = document.getElementById('db-notify-mark-all');
  var csrfMeta = document.querySelector('[data-csrf]');
  var csrf =
    (csrfMeta && csrfMeta.getAttribute('data-csrf')) ||
    (document.querySelector('input[name="_csrf"]') &&
      document.querySelector('input[name="_csrf"]').value) ||
    '';

  function setBadge(n) {
    if (!badge) return;
    if (n > 0) {
      badge.hidden = false;
      badge.textContent = n > 99 ? '99+' : String(n);
    } else {
      badge.hidden = true;
      badge.textContent = '0';
    }
  }

  function fmtDate(v) {
    if (!v) return '';
    try {
      return String(v).replace('T', ' ').slice(0, 16);
    } catch (_) {
      return '';
    }
  }

  function render(items) {
    if (!items || !items.length) {
      list.innerHTML = '<p class="db-notify__empty">No notifications yet.</p>';
      return;
    }
    list.innerHTML = items
      .map(function (n) {
        return (
          '<article class="db-notify__item' +
          (n.unread ? ' is-unread' : '') +
          '" data-id="' +
          n.id +
          '">' +
          '<strong>' +
          escapeHtml(n.title || 'Notice') +
          '</strong>' +
          '<p>' +
          escapeHtml(n.body || '') +
          '</p>' +
          '<time>' +
          escapeHtml(fmtDate(n.createdAt)) +
          '</time>' +
          '</article>'
        );
      })
      .join('');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function load() {
    return fetch('/app/notifications', {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin'
    })
      .then(function (r) {
        if (!r.ok) throw new Error('Failed');
        return r.json();
      })
      .then(function (data) {
        setBadge(data.unread || 0);
        render(data.items || []);
      })
      .catch(function () {
        list.innerHTML = '<p class="db-notify__empty">Could not load notifications.</p>';
      });
  }

  function openPanel() {
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    load();
  }

  function closePanel() {
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (panel.hidden) openPanel();
    else closePanel();
  });

  document.addEventListener('click', function (e) {
    if (!root.contains(e.target)) closePanel();
  });

  list.addEventListener('click', function (e) {
    var item = e.target.closest('.db-notify__item');
    if (!item || !item.dataset.id) return;
    fetch('/app/notifications/' + encodeURIComponent(item.dataset.id) + '/read', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-csrf-token': csrf
      },
      credentials: 'same-origin',
      body: '{}'
    }).then(function () {
      item.classList.remove('is-unread');
      load();
    });
  });

  if (markAll) {
    markAll.addEventListener('click', function () {
      fetch('/app/notifications/read-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-csrf-token': csrf
        },
        credentials: 'same-origin',
        body: '{}'
      }).then(function () {
        load();
      });
    });
  }

  // Badge on page load
  load();
})();