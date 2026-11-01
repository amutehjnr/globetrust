/* public/js/admin-support-chat.js */
'use strict';

(function () {
  var input = document.getElementById('chat-input');
  var quickButtons = document.querySelectorAll('[data-quick]');
  var form = document.getElementById('chat-form');
  var log = document.getElementById('chat-log');
  var fileInput = document.getElementById('chat-file');
  var fileNameEl = document.getElementById('chat-file-name');

  if (input && quickButtons.length) {
    quickButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        var reply = button.getAttribute('data-quick') || '';
        if (!reply || input.disabled || input.readOnly) return;
        var existing = input.value.trim();
        input.value = existing ? existing + '\n\n' + reply : reply;
        input.focus();
        var cursorPosition = input.value.length;
        input.setSelectionRange(cursorPosition, cursorPosition);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
  }

  if (!log || !form) return;

  var conversationId = log.getAttribute('data-conversation');
  var userId = log.getAttribute('data-user');
  var socket = null;

  function csrfToken() {
    var el = form.querySelector('input[name="_csrf"]');
    return el ? el.value : '';
  }

  function clearEmpty() {
    var empty = log.querySelector('.chat-empty');
    if (empty) empty.remove();
  }

  function appendMessage(msg) {
    if (!msg) return;
    clearEmpty();
    var div = document.createElement('div');
    div.className = 'msg' + (msg.senderUserId === userId ? ' me' : '');
    var bubble = document.createElement('div');
    bubble.className = 'bubble';

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
      img.className = 'chat-attach-img';
      a.appendChild(img);
      bubble.appendChild(a);
      if (msg.text && msg.text !== msg.attachmentName) {
        var p = document.createElement('div');
        p.className = 'chat-attach-caption';
        p.textContent = msg.text;
        bubble.appendChild(p);
      }
    } else if (msg.attachmentUrl) {
      var link = document.createElement('a');
      link.href = msg.attachmentUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'chat-attach-file';
      link.textContent = msg.attachmentName || 'Download file';
      bubble.appendChild(link);
      if (msg.text && msg.text !== msg.attachmentName) {
        var cap = document.createElement('div');
        cap.className = 'chat-attach-caption';
        cap.textContent = msg.text;
        bubble.appendChild(cap);
      }
    } else {
      bubble.textContent = msg.text || '';
    }

    div.appendChild(bubble);
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function resetFile() {
    if (fileInput) fileInput.value = '';
    if (fileNameEl) {
      fileNameEl.textContent = '';
      fileNameEl.hidden = true;
    }
  }

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
      if (input && f) input.removeAttribute('required');
      else if (input && !(input.value || '').trim()) input.setAttribute('required', 'required');
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
    if (!res.ok || !data || !data.ok) {
      throw new Error((data && data.message) || 'Send failed');
    }
    appendMessage(data.message);
    if (input) input.value = '';
    resetFile();
    if (input) input.setAttribute('required', 'required');
  }

  if (typeof io !== 'undefined' && conversationId) {
    socket = io({ path: '/socket.io', withCredentials: true });
    socket.on('connect', function () {
      socket.emit('support:join', { conversationId: conversationId }, function () {});
    });
    socket.on('support:message', function (payload) {
      if (!payload || payload.conversationId !== conversationId) return;
      // Avoid double-append for own HTTP sends when possible by id check is hard; accept possible duplicate rare
      appendMessage(payload.message);
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = (input && input.value) || '';
    var hasFile = fileInput && fileInput.files && fileInput.files[0];

    if (hasFile) {
      sendViaHttp().catch(function () {
        form.submit();
      });
      return;
    }

    if (socket && socket.connected && text.trim()) {
      socket.emit(
        'support:message',
        { conversationId: conversationId, text: text.trim() },
        function (res) {
          if (res && res.ok) {
            if (input) input.value = '';
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