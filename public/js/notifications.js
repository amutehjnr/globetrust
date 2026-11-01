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

  var unreadCount = 0;

  function setBadge(n) {
    unreadCount = Math.max(0, Number(n) || 0);
    if (!badge) return;
    if (unreadCount > 0) {
      badge.hidden = false;
      badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
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

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function render(items) {
    if (!list) return;
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
        if (list) {
          list.innerHTML = '<p class="db-notify__empty">Could not load notifications.</p>';
        }
      });
  }

  function prependLive(note) {
    if (!list) return;
    var empty = list.querySelector('.db-notify__empty');
    if (empty) empty.remove();
    var html =
      '<article class="db-notify__item is-unread" data-id="' +
      escapeHtml(note.id || '') +
      '">' +
      '<strong>' +
      escapeHtml(note.title || 'Notice') +
      '</strong>' +
      '<p>' +
      escapeHtml(note.body || '') +
      '</p>' +
      '<time>Just now</time>' +
      '</article>';
    list.insertAdjacentHTML('afterbegin', html);
    setBadge(unreadCount + 1);
  }

  function openPanel() {
    if (!panel || !btn) return;
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    load();
  }

  function closePanel() {
    if (!panel || !btn) return;
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }

  if (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!panel) return;
      if (panel.hidden) openPanel();
      else closePanel();
    });
  }

  document.addEventListener('click', function (e) {
    if (!panel || panel.hidden) return;
    if (root.contains(e.target)) return;
    closePanel();
  });

  if (list) {
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
  }

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

  // Realtime: socket notification:new
  if (typeof io !== 'undefined') {
    try {
      var sock = io({ path: '/socket.io', withCredentials: true });
      sock.on('notification:new', function (note) {
        if (!note) return;
        prependLive(note);
        try {
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(note.title || 'Globe Trust', {
              body: note.body || '',
              icon: '/favicon.ico'
            });
          }
        } catch (_) {}
      });
    } catch (_) {}
  }

  // Fallback poll every 45s
  load();
  setInterval(function () {
    load();
  }, 45000);
})();