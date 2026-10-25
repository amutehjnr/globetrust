/* public/js/admin-support-chat.js */
'use strict';

(function () {
  var input = document.getElementById('chat-input');
  var quickButtons = document.querySelectorAll('[data-quick]');

  if (!input || !quickButtons.length) {
    return;
  }

  quickButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      var reply = button.getAttribute('data-quick') || '';

      if (!reply || input.disabled || input.readOnly) {
        return;
      }

      var existing = input.value.trim();

      input.value = existing
        ? existing + '\n\n' + reply
        : reply;

      input.focus();

      var cursorPosition = input.value.length;
      input.setSelectionRange(cursorPosition, cursorPosition);

      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
})();