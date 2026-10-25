'use strict';

(function () {
  const form = document.getElementById('nc-form');
  if (!form) return;

  const firstEl = document.getElementById('nc-first');
  const lastEl = document.getElementById('nc-last');
  const emailEl = document.getElementById('nc-email');
  const pwdEl = document.getElementById('nc-password');

  const toggleEl = document.getElementById('nc-password-toggle');
  const generateEl = document.getElementById('nc-generate-password');

  const fillEl = document.getElementById('nc-strength-fill');
  const labelEl = document.getElementById('nc-strength-label');

  const previewAvatar = document.getElementById('nc-preview-avatar');
  const previewName = document.getElementById('nc-preview-name');
  const previewEmail = document.getElementById('nc-preview-email');
  const previewStatus = document.getElementById('nc-preview-status');

  const activeInputs = document.querySelectorAll(
    'input[name="activate"]'
  );

  const eyeIcon = toggleEl
    ? toggleEl.querySelector('.nc-icon-eye')
    : null;

  const eyeOffIcon = toggleEl
    ? toggleEl.querySelector('.nc-icon-eye-off')
    : null;

  function updatePreview() {
    const firstName = firstEl.value.trim();
    const lastName = lastEl.value.trim();
    const email = emailEl.value.trim();

    previewName.textContent =
      [firstName, lastName].filter(Boolean).join(' ') ||
      'Customer name';

    let initials = '';

    if (firstName) initials += Array.from(firstName)[0];
    if (lastName) initials += Array.from(lastName)[0];

    if (!initials && email) {
      initials = Array.from(email)[0];
    }

    previewAvatar.textContent = initials.toUpperCase() || '—';
    previewEmail.textContent = email || 'email@example.com';
  }

  function updateActivation() {
    const selected = document.querySelector(
      'input[name="activate"]:checked'
    );

    const isActive = !selected || selected.value === 'yes';

    previewStatus.replaceChildren();

    const dot = document.createElement('span');
    dot.className = 'nc-preview-dot';

    previewStatus.appendChild(dot);
    previewStatus.appendChild(
      document.createTextNode(
        isActive ? 'Active on creation' : 'Pending verification'
      )
    );

    previewStatus.classList.toggle(
      'nc-preview-status-pending',
      !isActive
    );
  }

  function scorePassword(password) {
    if (!password) return 0;

    let score = 0;

    if (password.length >= 12) score++;
    if (password.length >= 16) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    return score;
  }

  function updateStrength() {
    const password = pwdEl.value;
    const score = scorePassword(password);

    const levels = [
      { label: 'Enter a password', color: '#94a3b8' },
      { label: 'Very weak', color: '#dc2626' },
      { label: 'Weak', color: '#ea580c' },
      { label: 'Fair', color: '#ca8a04' },
      { label: 'Good', color: '#16845b' },
      { label: 'Strong', color: '#047857' }
    ];

    const level = levels[score];

    fillEl.style.width = `${(score / 5) * 100}%`;
    fillEl.style.backgroundColor = level.color;

    labelEl.textContent = level.label;
    labelEl.style.color = level.color;
  }

  function randomIndex(max) {
    if (!Number.isInteger(max) || max < 1) {
      throw new Error('Invalid random selection range.');
    }

    const cryptoApi = window.crypto;

    if (!cryptoApi || !cryptoApi.getRandomValues) {
      throw new Error(
        'Secure password generation is unavailable in this browser.'
      );
    }

    // Rejection sampling avoids modulo bias.
    const range = 0x100000000;
    const limit = range - (range % max);
    const buffer = new Uint32Array(1);

    do {
      cryptoApi.getRandomValues(buffer);
    } while (buffer[0] >= limit);

    return buffer[0] % max;
  }

  function secureShuffle(items) {
    for (let i = items.length - 1; i > 0; i--) {
      const j = randomIndex(i + 1);
      [items[i], items[j]] = [items[j], items[i]];
    }

    return items;
  }

  function generatePassword() {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnpqrstuvwxyz';
    const digits = '23456789';
    const symbols = '!@#$%&*?';
    const all = upper + lower + digits + symbols;

    const characters = [
      upper[randomIndex(upper.length)],
      lower[randomIndex(lower.length)],
      digits[randomIndex(digits.length)],
      symbols[randomIndex(symbols.length)]
    ];

    for (let i = 0; i < 12; i++) {
      characters.push(all[randomIndex(all.length)]);
    }

    return secureShuffle(characters).join('');
  }

  function updatePasswordVisibility(visible) {
    pwdEl.type = visible ? 'text' : 'password';

    if (eyeIcon) {
      eyeIcon.classList.toggle('nc-hidden', visible);
    }

    if (eyeOffIcon) {
      eyeOffIcon.classList.toggle('nc-hidden', !visible);
    }

    if (toggleEl) {
      toggleEl.setAttribute(
        'aria-label',
        visible ? 'Hide password' : 'Show password'
      );
    }
  }

  [firstEl, lastEl, emailEl].forEach(function (element) {
    element.addEventListener('input', updatePreview);
  });

  activeInputs.forEach(function (element) {
    element.addEventListener('change', updateActivation);
  });

  pwdEl.addEventListener('input', updateStrength);

  if (toggleEl) {
    toggleEl.addEventListener('click', function () {
      updatePasswordVisibility(pwdEl.type !== 'text');
    });
  }

  if (generateEl) {
    generateEl.addEventListener('click', function () {
      try {
        pwdEl.value = generatePassword();
        updatePasswordVisibility(true);
        updateStrength();
        pwdEl.focus();
      } catch (error) {
        labelEl.textContent =
          'Unable to generate securely. Please try a supported browser.';
        labelEl.style.color = '#dc2626';
      }
    });
  }

  // Client-side checks improve usability; server-side validation is required.
  form.addEventListener('submit', function (event) {
    if (!form.checkValidity()) {
      event.preventDefault();
      form.reportValidity();
      return;
    }

    const password = pwdEl.value;

    if (
      password.length < 12 ||
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/\d/.test(password)
    ) {
      event.preventDefault();
      pwdEl.setCustomValidity(
        'Use at least 12 characters with uppercase, lowercase, and a number.'
      );
      pwdEl.reportValidity();
      pwdEl.setCustomValidity('');
      pwdEl.focus();
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.setAttribute('aria-busy', 'true');
    }
  });

  updatePreview();
  updateActivation();
  updateStrength();
  updatePasswordVisibility(false);
})();