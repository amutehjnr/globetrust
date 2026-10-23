(function () {
  const log = document.getElementById('chat-log');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const statusEl = document.getElementById('socket-status');
  if (!log || !form || typeof io === 'undefined') {
    if (statusEl) statusEl.textContent = 'Live chat unavailable — form still works.';
    return;
  }

  const conversationId = log.getAttribute('data-conversation');
  const userId = log.getAttribute('data-user');
  const socket = io({ path: '/socket.io', withCredentials: true });

  function appendMessage(msg) {
    const div = document.createElement('div');
    div.className = 'msg' + (msg.senderUserId === userId ? ' me' : '');
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = msg.text;
    div.appendChild(bubble);
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  socket.on('connect', function () {
    if (statusEl) statusEl.textContent = 'Live connection active';
    socket.emit('support:join', { conversationId: conversationId }, function (res) {
      if (!res || !res.ok) {
        if (statusEl) statusEl.textContent = 'Connected, but room join failed — use form.';
      }
    });
  });

  socket.on('connect_error', function () {
    if (statusEl) statusEl.textContent = 'Live chat offline — messages still send via form.';
  });

  socket.on('support:message', function (payload) {
    if (!payload || payload.conversationId !== conversationId) return;
    appendMessage(payload.message);
  });

  form.addEventListener('submit', function (e) {
    if (!socket.connected) return; // allow normal POST
    e.preventDefault();
    const text = (input.value || '').trim();
    if (!text) return;
    socket.emit(
      'support:message',
      { conversationId: conversationId, text: text },
      function (res) {
        if (res && res.ok) {
          input.value = '';
        } else {
          form.submit();
        }
      }
    );
  });
})();
