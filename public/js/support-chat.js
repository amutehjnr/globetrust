(function () {
  const log = document.getElementById('chat-log');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const fileInput = document.getElementById('chat-file');
  const fileNameEl = document.getElementById('chat-file-name');
  const statusEl = document.getElementById('socket-status');
  if (!log || !form) return;

  const conversationId = log.getAttribute('data-conversation');
  const userId = log.getAttribute('data-user');
  let socket = null;

  function csrfToken() {
    const el = form.querySelector('input[name="_csrf"]');
    return el ? el.value : '';
  }

  function clearEmpty() {
    const empty = log.querySelector('.chat-empty');
    if (empty) empty.remove();
  }

  function appendMessage(msg) {
    if (!msg) return;
    clearEmpty();
    const div = document.createElement('div');
    div.className = 'msg' + (msg.senderUserId === userId ? ' me' : '');
    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    const isImage =
      msg.type === 'image' ||
      (msg.attachmentMime && String(msg.attachmentMime).indexOf('image/') === 0);

    if (msg.attachmentUrl && isImage) {
      const a = document.createElement('a');
      a.href = msg.attachmentUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      const img = document.createElement('img');
      img.src = msg.attachmentUrl;
      img.alt = msg.attachmentName || 'Image';
      img.className = 'chat-attach-img';
      a.appendChild(img);
      bubble.appendChild(a);
      if (msg.text && msg.text !== msg.attachmentName) {
        const p = document.createElement('div');
        p.className = 'chat-attach-caption';
        p.textContent = msg.text;
        bubble.appendChild(p);
      }
    } else if (msg.attachmentUrl) {
      const a = document.createElement('a');
      a.href = msg.attachmentUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'chat-attach-file';
      a.textContent = msg.attachmentName || 'Download file';
      bubble.appendChild(a);
      if (msg.text && msg.text !== msg.attachmentName) {
        const p = document.createElement('div');
        p.className = 'chat-attach-caption';
        p.textContent = msg.text;
        bubble.appendChild(p);
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
      const f = fileInput.files && fileInput.files[0];
      if (fileNameEl) {
        if (f) {
          fileNameEl.textContent = f.name;
          fileNameEl.hidden = false;
        } else {
          resetFile();
        }
      }
      if (input && f) {
        input.removeAttribute('required');
      } else if (input && !(input.value || '').trim()) {
        input.setAttribute('required', 'required');
      }
    });
  }

  async function sendViaHttp() {
    const text = (input && input.value) || '';
    const hasFile = fileInput && fileInput.files && fileInput.files[0];
    if (!text.trim() && !hasFile) return;

    const fd = new FormData();
    fd.append('_csrf', csrfToken());
    fd.append('conversationId', conversationId || '');
    fd.append('text', text);
    fd.append('ajax', '1');
    if (hasFile) fd.append('file', fileInput.files[0]);

    const res = await fetch(form.action, {
      method: 'POST',
      body: fd,
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });
    const data = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !data || !data.ok) {
      throw new Error((data && data.message) || 'Send failed');
    }
    // Message is also broadcast over socket; append if socket offline
    if (!socket || !socket.connected) {
      appendMessage(data.message);
    } else {
      // Still append optimistically if broadcast is delayed
      appendMessage(data.message);
    }
    if (input) input.value = '';
    resetFile();
    if (input) input.setAttribute('required', 'required');
  }

  if (typeof io !== 'undefined') {
    socket = io({ path: '/socket.io', withCredentials: true });

    socket.on('connect', function () {
      if (statusEl) {
        const t = statusEl.querySelector('.chat-status-text') || statusEl;
        t.textContent = 'Live connection active';
      }
      socket.emit('support:join', { conversationId: conversationId }, function (res) {
        if (!res || !res.ok) {
          if (statusEl) {
            const t = statusEl.querySelector('.chat-status-text') || statusEl;
            t.textContent = 'Connected — room join failed; form still works.';
          }
        }
      });
    });

    socket.on('connect_error', function () {
      if (statusEl) {
        const t = statusEl.querySelector('.chat-status-text') || statusEl;
        t.textContent = 'Live chat offline — messages still send via form.';
      }
    });

    socket.on('support:message', function (payload) {
      if (!payload || payload.conversationId !== conversationId) return;
      appendMessage(payload.message);
    });
  } else if (statusEl) {
    statusEl.textContent = 'Live chat unavailable — form still works.';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const text = (input && input.value) || '';
    const hasFile = fileInput && fileInput.files && fileInput.files[0];

    // Files always go HTTP (multipart)
    if (hasFile) {
      sendViaHttp().catch(function () {
        form.submit();
      });
      return;
    }

    // Text-only: prefer socket when connected
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