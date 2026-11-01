/* public/js/admin-support-chat.js — text replies + live updates for redesigned thread */
'use strict';

(function () {
  var input = document.getElementById('chat-input');
  var quickButtons = document.querySelectorAll('[data-quick]');
  var form = document.getElementById('chat-form');
  var log = document.getElementById('chat-log');
  var statusEl = document.getElementById('socket-status');

  if (input && quickButtons.length) {
    quickButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        var reply = button.getAttribute('data-quick') || '';
        if (!reply || input.disabled || input.readOnly) return;
        var existing = input.value.trim();
        input.value = existing ? existing + '\n\n' + reply : reply;
        input.focus();
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
  }

  if (!log || !form) return;

  var conversationId = log.getAttribute('data-conversation');
  var userId = log.getAttribute('data-user');
  var socket = null;
  var seen = {};

  function setStatus(t) {
    if (!statusEl) return;
    var text = statusEl.querySelector('.ast-status-text') || statusEl;
    text.textContent = t || '';
  }

  function clearEmpty() {
    var empty = log.querySelector('.ast-empty, .chat-empty');
    if (empty) empty.remove();
  }

  function appendMessage(msg) {
    if (!msg) return;
    if (msg.id != null) {
      var k = String(msg.id);
      if (seen[k]) return;
      seen[k] = true;
    }
    clearEmpty();

    var mine = msg.senderUserId === userId;
    var row = document.createElement('div');
    row.className = 'ast-msg ' + (mine ? 'ast-msg--me' : 'ast-msg--them');

    if (!mine) {
      var av = document.createElement('div');
      av.className = 'ast-msg-avatar';
      av.setAttribute('aria-hidden', 'true');
      av.textContent = 'CU';
      row.appendChild(av);
    }

    var bubble = document.createElement('div');
    bubble.className = 'ast-bubble';

    var isImage =
      msg.type === 'image' ||
      (msg.attachmentMime && String(msg.attachmentMime).indexOf('image/') === 0);

    if (msg.attachmentUrl && isImage) {
      var a = document.createElement('a');
      a.href = msg.attachmentUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'ast-attach-img-wrap';
      var img = document.createElement('img');
      img.src = msg.attachmentUrl;
      img.alt = msg.attachmentName || 'Image';
      img.className = 'ast-attach-img';
      a.appendChild(img);
      bubble.appendChild(a);
    } else if (msg.attachmentUrl) {
      var link = document.createElement('a');
      link.href = msg.attachmentUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'ast-attach-file';
      link.textContent = msg.attachmentName || 'Download file';
      bubble.appendChild(link);
    } else {
      var text = document.createElement('div');
      text.className = 'ast-bubble-text';
      text.textContent = msg.text || '';
      bubble.appendChild(text);
    }

    row.appendChild(bubble);
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }

  function csrfToken() {
    var el = form.querySelector('input[name="_csrf"]');
    return el ? el.value : '';
  }

  async function sendViaHttp() {
    var text = (input && input.value) || '';
    if (!text.trim()) return;
    var fd = new FormData();
    fd.append('_csrf', csrfToken());
    fd.append('text', text);
    fd.append('ajax', '1');
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
    if (!text.trim()) return;

    if (socket && socket.connected) {
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
      return;
    }

    sendViaHttp().catch(function () {
      form.submit();
    });
  });
})();
