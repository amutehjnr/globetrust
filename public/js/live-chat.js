'use strict';

(function () {
  var widget = document.getElementById('lc-widget');
  if (!widget) return;

  var launcher = document.getElementById('lc-launcher');
  var panel = document.getElementById('lc-panel');
  var closeBtn = document.getElementById('lc-close');
  var body = document.getElementById('lc-body');
  var form = document.getElementById('lc-form');
  var input = document.getElementById('lc-input');
  var statusEl = document.getElementById('lc-status');
  var csrf = widget.getAttribute('data-csrf') || '';

  var conversationId = null;
  var userId = null;
  var loaded = false;
  var socket = null;

  function setStatus(t) {
    if (statusEl) statusEl.textContent = t || '';
  }

  function appendMsg(msg) {
    if (!body) return;
    var empty = body.querySelector('.lc-empty');
    if (empty) empty.remove();

    var row = document.createElement('div');
    row.className = 'lc-msg' + (msg.senderUserId === userId ? ' lc-msg--me' : '');
    var bubble = document.createElement('div');
    bubble.className = 'lc-msg__bubble';
    bubble.textContent = msg.text || '';
    row.appendChild(bubble);
    body.appendChild(row);
    body.scrollTop = body.scrollHeight;
  }

  function renderMessages(list) {
    if (!body) return;
    body.innerHTML = '';
    if (!list || !list.length) {
      body.innerHTML = '<p class="lc-empty">Start a conversation with support. We typically reply within a few minutes.</p>';
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
        appendMsg({
          text: payload.text || (payload.message && payload.message.text) || '',
          senderUserId: payload.senderUserId || (payload.message && payload.message.senderUserId)
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

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = ((input && input.value) || '').trim();
      if (!text || !conversationId) return;
      var bodyData = new URLSearchParams();
      bodyData.set('_csrf', csrf);
      bodyData.set('conversationId', conversationId);
      bodyData.set('text', text);
      input.value = '';
      appendMsg({ text: text, senderUserId: userId });
      fetch('/app/support/messages', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json'
        },
        body: bodyData.toString()
      })
        .then(function (r) {
          if (!r.ok) throw new Error('send failed');
          return r.json();
        })
        .then(function () {
          setStatus('Sent');
        })
        .catch(function () {
          setStatus('Message may not have sent — try again');
        });
    });
  }
})();