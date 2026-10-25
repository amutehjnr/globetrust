/* public/js/reset-password.js */
(function () {
  'use strict';

  var form = document.getElementById('rp-form');
  if (!form) return;

  var password = document.getElementById('rp-password');
  var confirmPassword = document.getElementById('rp-confirm');
  var matchMessage = document.getElementById('rp-match');
  var requirements = document.querySelectorAll('#rp-reqs li');

  if (!password || !confirmPassword || !matchMessage) return;

  var submitButton = document.getElementById('rp-submit');

  function bindToggle(buttonId, input) {
    var button = document.getElementById(buttonId);
    if (!button) return;

    var eye = button.querySelector('.rp-icon-eye');
    var eyeOff = button.querySelector('.rp-icon-eye-off');

    button.addEventListener('click', function () {
      var showPassword = input.type === 'password';

      input.type = showPassword ? 'text' : 'password';

      if (eye) eye.style.display = showPassword ? 'none' : '';
      if (eyeOff) eyeOff.style.display = showPassword ? '' : 'none';

      button.setAttribute(
        'aria-label',
        showPassword ? 'Hide password' : 'Show password'
      );
    });
  }

  bindToggle('rp-toggle-1', password);
  bindToggle('rp-toggle-2', confirmPassword);

  function checkRequirements(value) {
    return {
      length: value.length >= 12,
      upper: /[A-Z]/.test(value),
      lower: /[a-z]/.test(value),
      number: /[0-9]/.test(value)
    };
  }

  function updateRequirements() {
    var checks = checkRequirements(password.value);
    var allPassed = true;

    requirements.forEach(function (item) {
      var key = item.getAttribute('data-req');
      var passed = Boolean(checks[key]);

      item.classList.toggle('is-met', passed);

      if (!passed) allPassed = false;
    });

    return allPassed;
  }

  function updateMatch() {
    if (!confirmPassword.value) {
      matchMessage.textContent = '';
      matchMessage.className = 'rp-match';
      return password.value.length > 0;
    }

    var matches = password.value === confirmPassword.value;

    matchMessage.textContent = matches
      ? 'Passwords match'
      : 'Passwords do not match';

    matchMessage.className = matches
      ? 'rp-match rp-match-ok'
      : 'rp-match rp-match-err';

    return matches;
  }

  password.addEventListener('input', function () {
    updateRequirements();
    updateMatch();
  });

  confirmPassword.addEventListener('input', updateMatch);

  form.addEventListener('submit', function (event) {
    var requirementsPassed = updateRequirements();
    var passwordsMatch = updateMatch();
    var passwordPresent = password.value.length > 0;
    var confirmationPresent = confirmPassword.value.length > 0;

    if (
      !passwordPresent ||
      !confirmationPresent ||
      !requirementsPassed ||
      !passwordsMatch
    ) {
      event.preventDefault();

      if (!passwordPresent || !requirementsPassed) {
        password.focus();
      } else {
        confirmPassword.focus();
      }

      return;
    }

    // Avoid accidental double submission.
    // The server remains responsible for validating the reset token,
    // password policy, and confirmation.
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.setAttribute('aria-busy', 'true');
      submitButton.textContent = 'Updating password…';
    }
  });

  updateRequirements();
  updateMatch();
})();