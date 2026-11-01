'use strict';

/**
 * Floating Live chat — realtime messages, image attachments, unread badge.
 */
(function () {
  var widget = document.getElementById('lc-widget');
  if (!widget) return;

  var launcher = document.getElementById('lc-launcher');
  var panel = document.getElementById('lc-panel');
  var closeBtn = document.getElementById('lc-close');
  var body = document.getElementById('lc-body');
  var form = document.getElementById('lc-form');
  var input = document.getElementById('lc-input');
  var fileInput = document.getElementById('lc-file');
  var fileNameEl = document.getElementById('lc-file-name');
  var statusEl = document.getElementById('lc-status');
  var csrf = widget.getAttribute('data-csrf') || '';

  var conversationId = null;
  var userId = null;
  var loaded = false;
  var socket = null;
  var seenIds = {};
  var unread = 0;

  function setStatus(t) {
    if (statusEl) statusEl.textContent = t || '';
  }

  function ensureBadge() {
    if (!launcher) return null;
    var b = launcher.querySelector('.lc-badge');
    if (!b) {
      b = document.createElement('span');
      b.className = 'lc-badge';
      b.hidden = true;
      launcher.appendChild(b);
    }
    return b;
  }

  function setUnread(n) {
    unread = Math.max(0, n);
    var b = ensureBadge();
    if (!b) return;
    if (unread > 0) {
      b.hidden = false;
      b.textContent = unread > 9 ? '9+' : String(unread);
      launcher.classList.add('has-unread');
    } else {
      b.hidden = true;
      b.textContent = '';
      launcher.classList.remove('has-unread');
    }
  }

  function panelOpen() {
    return panel && !panel.hidden;
  }

  function desktopNotify(title, bodyText) {
    try {
      if (!('Notification' in window)) return;
      if (Notification.permission === 'granted') {
        new Notification(title || 'Globe Trust', {
          body: bodyText || '',
          icon: '/favicon.ico'
        });
      }
    } catch (_) {}
  }

  function requestNotifyPermission() {
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    } catch (_) {}
  }

  function resetFile() {
    if (fileInput) fileInput.value = '';
    if (fileNameEl) {
      fileNameEl.textContent = '';
      fileNameEl.hidden = true;
    }
  }

  function isImageMessage(msg, url) {
    if (!msg) return false;
    if (msg.type === 'image') return true;
    var mime = msg.attachmentMime || msg.attachment_mime || '';
    if (mime && String(mime).indexOf('image/') === 0) return true;
    var name = msg.attachmentName || msg.attachment_name || msg.text || '';
    if (/\.(jpe?g|png|gif|webp|heic|bmp)(\?|$)/i.test(name)) return true;
    if (url && /\.(jpe?g|png|gif|webp|heic|bmp)(\?|$)/i.test(url)) return true;
    // Cloudinary image delivery URLs often have /image/upload/
    if (url && /\/image\/upload\//i.test(url)) return true;
    if (url && /res\.cloudinary\.com\//i.test(url) && !/\.pdf(\?|$)/i.test(url)) return true;
    return false;
  }

  function extractAttachment(msg) {
    var url = msg.attachmentUrl || msg.attachment_url || null;
    var name = msg.attachmentName || msg.attachment_name || null;
    var mime = msg.attachmentMime || msg.attachment_mime || null;
    if (!url && msg.text) {
      var parts = String(msg.text).split(/\n/);
      for (var i = 0; i < parts.length; i++) {
        var line = parts[i].trim();
        if (/^https?:\/\//i.test(line)) {
          url = line;
          if (!name && parts[0] && i > 0) name = parts[0].trim();
          break;
        }
      }
      if (!url) {
        var m = String(msg.text).match(/(https?:\/\/\S+)/i);
        if (m) url = m[1];
      }
    }
    return { url: url, name: name, mime: mime };
  }

  function appendMsg(msg, opts) {
    if (!body || !msg) return;
    opts = opts || {};
    if (msg.id != null) {
      var key = String(msg.id);
      if (seenIds[key]) return;
      seenIds[key] = true;
    }

    var empty = body.querySelector('.lc-empty');
    if (empty) empty.remove();

    var row = document.createElement('div');
    row.className = 'lc-msg' + (msg.senderUserId === userId ? ' lc-msg--me' : '');
    var bubble = document.createElement('div');
    bubble.className = 'lc-msg__bubble';

    var att = extractAttachment(msg);
    var showImage = att.url && isImageMessage(msg, att.url);

    if (showImage) {
      var a = document.createElement('a');
      a.href = att.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      var img = document.createElement('img');
      img.src = att.url;
      img.alt = att.name || 'Image';
      img.className = 'lc-msg__img';
      img.loading = 'lazy';
      a.appendChild(img);
      bubble.appendChild(a);
      var caption = (msg.text || '').trim();
      if (
        caption &&
        caption !== att.name &&
        caption.toLowerCase() !== 'image' &&
        !/\.(jpe?g|png|gif|webp)$/i.test(caption) &&
        (!att.url || caption.indexOf(att.url) === -1)
      ) {
        var cap = document.createElement('div');
        cap.className = 'lc-msg__caption';
        cap.textContent = caption;
        bubble.appendChild(cap);
      }
    } else if (att.url) {
      var link = document.createElement('a');
      link.href = att.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'lc-msg__file';
      link.textContent = att.name || 'Download file';
      bubble.appendChild(link);
    } else {
      bubble.textContent = msg.text || '';
    }

    row.appendChild(bubble);
    body.appendChild(row);
    body.scrollTop = body.scrollHeight;

    if (
      !opts.silent &&
      msg.senderUserId &&
      msg.senderUserId !== userId &&
      !panelOpen()
    ) {
      setUnread(unread + 1);
      desktopNotify('New support message', msg.text || msg.attachmentName || 'New message');
    }
  }

  function renderMessages(list) {
    if (!body) return;
    body.innerHTML = '';
    seenIds = {};
    if (!list || !list.length) {
      body.innerHTML =
        '<p class="lc-empty">Start a conversation with support. We typically reply within a few minutes.</p>';
      return;
    }
    list.forEach(function (m) {
      appendMsg(m, { silent: true });
    });
  }

  function connectSocket() {
    if (typeof io === 'undefined') return;
    try {
      if (!socket) {
        socket = io({ path: '/socket.io', withCredentials: true });
      }
      socket.on('connect', function () {
        setStatus('Live · connected');
        if (conversationId) {
          socket.emit('support:join', { conversationId: conversationId }, function () {});
        }
      });
      socket.on('connect_error', function () {
        setStatus('Online · messages still send');
      });
      socket.on('support:message', function (payload) {
        if (!payload || payload.conversationId !== conversationId) return;
        var m = payload.message || payload;
        appendMsg(m);
      });
      socket.on('support:notify', function (payload) {
        if (!payload) return;
        if (!panelOpen()) {
          setUnread(unread + 1);
          desktopNotify('Support replied', payload.preview || '');
        }
      });
    } catch (e) {
      setStatus('Online');
    }
  }

  function loadChat() {
    setStatus('Connecting…');
    fetch('/app/support/api', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    })
      .then(function (r) {
        if (!r.ok) throw new Error('Failed to open chat');
        return r.json();
      })
      .then(function (data) {
        conversationId = data.conversationId;
        userId = data.userId;
        renderMessages(data.messages || []);
        loaded = true;
        setStatus('Online');
        connectSocket();
      })
      .catch(function () {
        setStatus('Unable to load chat — try Support page');
        if (body) {
          body.innerHTML =
            '<p class="lc-empty">Could not load live chat. <a href="/app/support">Open Support</a></p>';
        }
      });
  }

  function openPanel() {
    if (!panel) return;
    panel.hidden = false;
    if (launcher) launcher.setAttribute('aria-expanded', 'true');
    setUnread(0);
    if (!loaded) loadChat();
    else if (socket && conversationId) {
      socket.emit('support:join', { conversationId: conversationId }, function () {});
    }
    if (input) setTimeout(function () { input.focus(); }, 50);
    requestNotifyPermission();
  }

  function closePanel() {
    if (!panel) return;
    panel.hidden = true;
    if (launcher) launcher.setAttribute('aria-expanded', 'false');
  }

  if (launcher) {
    launcher.addEventListener('click', function () {
      if (panel && panel.hidden) openPanel();
      else closePanel();
    });
  }
  if (closeBtn) closeBtn.addEventListener('click', closePanel);

  if (fileInput) {
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (fileNameEl) {
        if (f) {
          fileNameEl.textContent = f.name;
          fileNameEl.hidden = false;
        } else {
          resetFile();
        }
      }
    });
  }

  connectSocket();

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!conversationId) return;

      var text = ((input && input.value) || '').trim();
      var hasFile = fileInput && fileInput.files && fileInput.files[0];
      if (!text && !hasFile) return;

      setStatus('Sending…');

      if (!hasFile && socket && socket.connected && text) {
        socket.emit(
          'support:message',
          { conversationId: conversationId, text: text },
          function (res) {
            if (res && res.ok) {
              if (input) input.value = '';
              setStatus('Sent');
            } else {
              sendHttp(text, false);
            }
          }
        );
        return;
      }

      sendHttp(text, hasFile);
    });
  }

  function sendHttp(text, hasFile) {
    var fd = new FormData();
    fd.append('_csrf', csrf);
    fd.append('conversationId', conversationId);
    fd.append('text', text || '');
    fd.append('ajax', '1');
    if (hasFile && fileInput.files[0]) fd.append('file', fileInput.files[0]);

    fetch('/app/support/messages', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      body: fd
    })
      .then(function (r) {
        if (!r.ok) throw new Error('send failed');
        return r.json();
      })
      .then(function (data) {
        if (data && data.message) appendMsg(data.message, { silent: true });
        if (input) input.value = '';
        resetFile();
        setStatus('Sent');
      })
      .catch(function () {
        setStatus('Message may not have sent — try again');
      });
  }
})();