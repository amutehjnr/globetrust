
/* public/js/mfa-verify.js */

(function () {
  'use strict';

  var codeInput = document.getElementById('mv-code');

  if (!codeInput) return;

  codeInput.addEventListener('input', function () {
    var digits = this.value.replace(/\D/g, '').slice(0, 6);

    if (this.value !== digits) {
      this.value = digits;
    }

    this.classList.remove('is-error');
  });
})();
