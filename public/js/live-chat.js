'use strict';

/**
 * Floating Live chat widget (bottom-right) — text + file upload.
 * Posts to /app/support/messages (multipart when a file is selected).
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

  function setStatus(t) {
    if (statusEl) statusEl.textContent = t || '';
  }

  function resetFile() {
    if (fileInput) fileInput.value = '';
    if (fileNameEl) {
      fileNameEl.textContent = '';
      fileNameEl.hidden = true;
    }
  }

  function appendMsg(msg) {
    if (!body || !msg) return;
    var empty = body.querySelector('.lc-empty');
    if (empty) empty.remove();

    var row = document.createElement('div');
    row.className = 'lc-msg' + (msg.senderUserId === userId ? ' lc-msg--me' : '');
    var bubble = document.createElement('div');
    bubble.className = 'lc-msg__bubble';

    var isImage =
      msg.type === 'image' ||
      (msg.attachmentMime && String(msg.attachmentMime).indexOf('image/') === 0);

    if (msg.attachmentUrl && isImage) {
      var a = document.createElement('a');
      a.href = msg.attachmentUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      var img = document.createElement('img');
      img.src = msg.attachmentUrl;
      img.alt = msg.attachmentName || 'Image';
      img.className = 'lc-msg__img';
      a.appendChild(img);
      bubble.appendChild(a);
      if (msg.text && msg.text !== msg.attachmentName) {
        var cap = document.createElement('div');
        cap.className = 'lc-msg__caption';
        cap.textContent = msg.text;
        bubble.appendChild(cap);
      }
    } else if (msg.attachmentUrl) {
      var link = document.createElement('a');
      link.href = msg.attachmentUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'lc-msg__file';
      link.textContent = msg.attachmentName || 'Download file';
      bubble.appendChild(link);
      if (msg.text && msg.text !== msg.attachmentName) {
        var c2 = document.createElement('div');
        c2.className = 'lc-msg__caption';
        c2.textContent = msg.text;
        bubble.appendChild(c2);
      }
    } else {
      bubble.textContent = msg.text || '';
    }

    row.appendChild(bubble);
    body.appendChild(row);
    body.scrollTop = body.scrollHeight;
  }

  function renderMessages(list) {
    if (!body) return;
    body.innerHTML = '';
    if (!list || !list.length) {
      body.innerHTML =
        '<p class="lc-empty">Start a conversation with support. We typically reply within a few minutes.</p>';
      return;
    }
    list.forEach(appendMsg);
  }

  function connectSocket() {
    if (typeof io === 'undefined' || !conversationId) return;
    try {
      socket = io({ path: '/socket.io', withCredentials: true });
      socket.on('connect', function () {
        setStatus('Live · connected');
        socket.emit('support:join', { conversationId: conversationId }, function () {});
      });
      socket.on('connect_error', function () {
        setStatus('Online · messages still send');
      });
      socket.on('support:message', function (payload) {
        if (!payload || payload.conversationId !== conversationId) return;
        var m = payload.message || payload;
        appendMsg({
          text: m.text || '',
          type: m.type,
          senderUserId: m.senderUserId,
          attachmentUrl: m.attachmentUrl || null,
          attachmentName: m.attachmentName || null,
          attachmentMime: m.attachmentMime || null
        });
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
    if (!loaded) loadChat();
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
        } else {
          resetFile();
        }
      }
    });
  }

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!conversationId) return;

      var text = ((input && input.value) || '').trim();
      var hasFile = fileInput && fileInput.files && fileInput.files[0];
      if (!text && !hasFile) return;

      setStatus('Sending…');

      var fd = new FormData();
      fd.append('_csrf', csrf);
      fd.append('conversationId', conversationId);
      fd.append('text', text);
      fd.append('ajax', '1');
      if (hasFile) fd.append('file', fileInput.files[0]);

      // Optimistic text bubble (files wait for server URL)
      if (text && !hasFile) {
        appendMsg({ text: text, senderUserId: userId });
        if (input) input.value = '';
      }

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
          if (hasFile && data && data.message) {
            appendMsg(data.message);
          }
          if (input) input.value = '';
          resetFile();
          setStatus('Sent');
        })
        .catch(function () {
          setStatus('Message may not have sent — try again');
        });
    });
  }
})();