'use strict';

(function () {
  var form = document.getElementById('chat-form');
  var input = document.getElementById('chat-input');
  var fileInput = document.getElementById('chat-file');
  var fileNameEl = document.getElementById('chat-file-name');
  var log = document.getElementById('chat-log');
  var statusEl = document.getElementById('socket-status');
  if (!form || !log) return;

  var conversationId = form.getAttribute('action').split('/').filter(Boolean)[2] || '';
  var socket = null;
  var selfId = log.getAttribute('data-self-id') || '';

  function setStatus(text) {
    if (!statusEl) return;
    var t = statusEl.querySelector('.ast-status-text');
    if (t) t.textContent = text;
    else statusEl.textContent = text;
  }

  function isImageMsg(msg) {
    if (!msg) return false;
    if (msg.type === 'image') return true;
    var mime = msg.attachmentMime || '';
    if (String(mime).indexOf('image/') === 0) return true;
    var url = msg.attachmentUrl || '';
    return /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url);
  }

  function appendMessage(msg) {
    if (!msg) return;
    if (msg.id) {
      var exists = log.querySelector('[data-msg-id="' + msg.id + '"]');
      if (exists) return;
    }
    var mine = selfId && String(msg.senderUserId) === String(selfId);
    var row = document.createElement('div');
    row.className = 'ast-msg' + (mine ? ' is-mine' : '');
    if (msg.id) row.setAttribute('data-msg-id', msg.id);

    var bubble = document.createElement('div');
    bubble.className = 'ast-bubble';

    if (msg.attachmentUrl && isImageMsg(msg)) {
      var wrap = document.createElement('a');
      wrap.href = msg.attachmentUrl;
      wrap.target = '_blank';
      wrap.rel = 'noopener noreferrer';
      wrap.className = 'ast-attach-img-wrap';
      var img = document.createElement('img');
      img.className = 'ast-attach-img';
      img.src = msg.attachmentUrl;
      img.alt = msg.attachmentName || 'Image';
      wrap.appendChild(img);
      bubble.appendChild(wrap);
      if (msg.text && msg.text !== msg.attachmentName) {
        var cap = document.createElement('div');
        cap.className = 'ast-attach-caption';
        cap.textContent = msg.text;
        bubble.appendChild(cap);
      }
    } else if (msg.attachmentUrl) {
      var link = document.createElement('a');
      link.href = msg.attachmentUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'ast-attach-file';
      link.textContent = msg.attachmentName || 'Download file';
      bubble.appendChild(link);
      if (msg.text && msg.text !== msg.attachmentName) {
        var t2 = document.createElement('div');
        t2.className = 'ast-bubble-text';
        t2.textContent = msg.text;
        bubble.appendChild(t2);
      }
    } else {
      var text = document.createElement('div');
      text.className = 'ast-bubble-text';
      text.textContent = msg.text || '';
      bubble.appendChild(text);
    }

    var time = document.createElement('time');
    time.className = 'ast-time';
    time.textContent = msg.createdAt || '';
    bubble.appendChild(time);

    row.appendChild(bubble);
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }

  function csrfToken() {
    var el = form.querySelector('input[name="_csrf"]');
    return el ? el.value : '';
  }

  function clearFile() {
    if (fileInput) fileInput.value = '';
    if (fileNameEl) {
      fileNameEl.hidden = true;
      fileNameEl.textContent = '';
    }
  }

  if (fileInput && fileNameEl) {
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (f) {
        fileNameEl.hidden = false;
        fileNameEl.textContent = f.name;
      } else {
        clearFile();
      }
    });
  }

  async function sendViaHttp() {
    var text = (input && input.value) || '';
    var hasFile = fileInput && fileInput.files && fileInput.files[0];
    if (!text.trim() && !hasFile) return;

    var fd = new FormData();
    fd.append('_csrf', csrfToken());
    fd.append('text', text);
    fd.append('ajax', '1');
    if (hasFile) fd.append('file', fileInput.files[0]);

    var res = await fetch(form.action, {
      method: 'POST',
      body: fd,
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });
    var data = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !data || !data.ok) throw new Error('Send failed');
    appendMessage(data.message);
    if (input) {
      input.value = '';
      input.style.height = 'auto';
    }
    clearFile();
  }

  if (typeof io !== 'undefined' && conversationId) {
    socket = io({ path: '/socket.io', withCredentials: true });
    socket.on('connect', function () {
      setStatus('Live · connected');
      socket.emit('support:join', { conversationId: conversationId }, function () {});
    });
    socket.on('connect_error', function () {
      setStatus('Offline · form still works');
    });
    socket.on('support:message', function (payload) {
      if (!payload || payload.conversationId !== conversationId) return;
      appendMessage(payload.message || payload);
    });
  } else {
    setStatus('Ready');
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = (input && input.value) || '';
    var hasFile = fileInput && fileInput.files && fileInput.files[0];
    if (!text.trim() && !hasFile) return;

    // Files always go over HTTP (multipart). Text-only can use socket.
    if (hasFile || !(socket && socket.connected)) {
      sendViaHttp().catch(function () {
        form.submit();
      });
      return;
    }

    socket.emit(
      'support:message',
      { conversationId: conversationId, text: text.trim() },
      function (res) {
        if (res && res.ok) {
          if (input) {
            input.value = '';
            input.style.height = 'auto';
          }
        } else {
          sendViaHttp().catch(function () {
            form.submit();
          });
        }
      }
    );
  });

  if (input) {
    input.addEventListener('input', function () {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 140) + 'px';
    });
  }
})();
