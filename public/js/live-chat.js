'use strict';

/**
 * Bottom-right Live chat widget only (#lc-widget).
 * Renders image attachments as <img> (admin already works; this matches that).
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
      b.setAttribute(
        'style',
        'position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#b91c1c;color:#fff;font-size:10px;font-weight:700;line-height:18px;text-align:center;'
      );
      b.hidden = true;
      launcher.style.position = launcher.style.position || 'relative';
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
    } else {
      b.hidden = true;
      b.textContent = '';
    }
  }

  function panelOpen() {
    return panel && !panel.hidden;
  }

  function resetFile() {
    if (fileInput) fileInput.value = '';
    if (fileNameEl) {
      fileNameEl.textContent = '';
      fileNameEl.hidden = true;
    }
  }

  function isClearlyDocument(url, mime, name) {
    var m = String(mime || '').toLowerCase();
    var u = String(url || '');
    var n = String(name || '');
    if (m.indexOf('image/') === 0) return false;
    if (m === 'application/pdf' || m.indexOf('pdf') >= 0) return true;
    if (m.indexOf('word') >= 0 || m === 'text/plain') return true;
    if (/\.pdf(\?|$)/i.test(u) || /\.pdf$/i.test(n)) return true;
    if (/\.(docx?|txt)(\?|$)/i.test(u) || /\.(docx?|txt)$/i.test(n)) return true;
    return false;
  }

  function normalize(msg) {
    var url = msg.attachmentUrl || msg.attachment_url || null;
    var name = msg.attachmentName || msg.attachment_name || null;
    var mime = msg.attachmentMime || msg.attachment_mime || null;
    var text = msg.text || '';
    var type = msg.type || 'text';

    if (text.indexOf('[[GLOBE_ATTACH]]') !== -1) {
      var chunks = text.split('[[GLOBE_ATTACH]]');
      text = (chunks[0] || '').trim();
      try {
        var meta = JSON.parse((chunks[1] || '').trim());
        if (meta) {
          url = url || meta.url || null;
          name = name || meta.name || null;
          mime = mime || meta.mime || null;
          if (meta.type) type = meta.type;
        }
      } catch (e) {}
    }

    if (!url && text) {
      var found = String(text).match(/(https?:\/\/[^\s]+)/i);
      if (found) {
        url = found[1];
        text = text.replace(found[1], '').trim();
      }
    }

    return {
      id: msg.id,
      senderUserId: msg.senderUserId,
      text: text,
      type: type,
      attachmentUrl: url,
      attachmentName: name,
      attachmentMime: mime
    };
  }

  function appendMsg(raw, opts) {
    if (!body || !raw) return;
    opts = opts || {};
    var msg = normalize(raw);

    if (msg.id != null) {
      var key = String(msg.id);
      if (seenIds[key]) return;
      seenIds[key] = true;
    }

    var empty = body.querySelector('.lc-empty');
    if (empty) empty.remove();

    var row = document.createElement('div');
    row.className = 'lc-msg' + (msg.senderUserId === userId ? ' lc-msg--me' : '');
    row.setAttribute(
      'style',
      'display:flex;margin:8px 0;' +
        (msg.senderUserId === userId ? 'justify-content:flex-end;' : 'justify-content:flex-start;')
    );

    var bubble = document.createElement('div');
    bubble.className = 'lc-msg__bubble';
    bubble.setAttribute(
      'style',
      'max-width:85%;padding:10px 12px;border-radius:14px;font-size:13px;line-height:1.45;word-break:break-word;' +
        (msg.senderUserId === userId
          ? 'background:#102238;color:#f8f4ea;'
          : 'background:#fff;border:1px solid #e8dfd0;color:#102238;')
    );

    var url = msg.attachmentUrl;
    var asImage = !!url && !isClearlyDocument(url, msg.attachmentMime, msg.attachmentName);

    if (asImage) {
      var a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      var img = document.createElement('img');
      img.src = url;
      img.alt = msg.attachmentName || 'Image';
      img.className = 'lc-msg__img';
      // Inline styles so image shows even if CSS file is outdated/cached
      img.setAttribute(
        'style',
        'display:block!important;max-width:min(220px,70vw)!important;max-height:240px!important;width:auto!important;height:auto!important;border-radius:10px;margin:0;background:#f3f4f6;object-fit:contain;'
      );
      img.onerror = function () {
        // Keep a visible fallback link if the browser blocks the img (e.g. CSP)
        if (bubble.querySelector('.lc-img-fallback')) return;
        var link = document.createElement('a');
        link.className = 'lc-img-fallback';
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'View image';
        link.style.cssText = 'display:block;margin-top:6px;color:inherit;text-decoration:underline;font-size:12px;';
        bubble.appendChild(link);
      };
      a.appendChild(img);
      bubble.appendChild(a);

      var caption = (msg.text || '').trim();
      if (
        caption &&
        caption !== msg.attachmentName &&
        caption.toLowerCase() !== 'image' &&
        !/\.(jpe?g|png|gif|webp)$/i.test(caption)
      ) {
        var cap = document.createElement('div');
        cap.textContent = caption;
        cap.style.marginTop = '6px';
        cap.style.fontSize = '12px';
        bubble.appendChild(cap);
      }
    } else if (url) {
      var link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = msg.attachmentName || 'Download file';
      link.style.color = 'inherit';
      link.style.textDecoration = 'underline';
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
    }
  }

  function renderMessages(list) {
    if (!body) return;
    body.innerHTML = '';
    seenIds = {};
    if (!list || !list.length) {
      body.innerHTML =
        '<p class="lc-empty" style="text-align:center;color:#7a8491;padding:24px 12px;">Start a conversation with support.</p>';
      return;
    }
    list.forEach(function (m) {
      appendMsg(m, { silent: true });
    });
  }

  function connectSocket() {
    if (typeof io === 'undefined') return;
    try {
      if (!socket) socket = io({ path: '/socket.io', withCredentials: true });
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
        appendMsg(payload.message || payload);
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
        setStatus('Unable to load chat');
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
        } else resetFile();
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
            } else sendHttp(text, false);
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
    fd.append('conversationId', conversationId || '');
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