'use strict';

(function () {
  var root = document.getElementById('db-modal-root');
  if (!root) return;

  var shell = document.querySelector('.db-shell');
  var mustMfa = shell && shell.getAttribute('data-must-enroll-mfa') === '1';
  var openModalEl = null;
  var banksLoaded = false;

  function openModal(name) {
    if (mustMfa) {
      window.location.href = '/mfa/enrol';
      return;
    }
    var modal = document.getElementById('modal-' + name);
    if (!modal) return;
    root.hidden = false;
    modal.hidden = false;
    openModalEl = modal;
    document.body.style.overflow = 'hidden';
    var first = modal.querySelector('select, input, button');
    if (first) setTimeout(function () { first.focus(); }, 50);
    if (name === 'wire' || name === 'personal-bank') {
      loadBanks(name);
    }
  }


  function showPageLoader(message) {
    var el = document.getElementById('db-loading-overlay');
    if (!el) return;
    var title = el.querySelector('.db-loading-overlay__title');
    if (title && message) title.textContent = message;
    el.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function hidePageLoader() {
    var el = document.getElementById('db-loading-overlay');
    if (!el) return;
    el.hidden = true;
  }

  function closeModal() {
    root.hidden = true;
    Array.prototype.forEach.call(root.querySelectorAll('.db-modal'), function (m) {
      m.hidden = true;
    });
    openModalEl = null;
    document.body.style.overflow = '';
  }

  function loadBanks(kind) {
    var selectId = kind === 'wire' ? 'wire-bank' : 'personal-bank';
    var hiddenId = kind === 'wire' ? 'wire-bank-code' : 'personal-bank-code';
    var select = document.getElementById(selectId);
    var hidden = document.getElementById(hiddenId);
    if (!select) return;

    fetch('/app/transfers/banks', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var banks = data.banks || [];
        select.innerHTML = '';
        var ph = document.createElement('option');
        ph.value = '';
        ph.disabled = true;
        ph.selected = true;
        ph.textContent = banks.length ? 'Select bank' : 'No banks — set country in Settings';
        select.appendChild(ph);
        banks.forEach(function (b) {
          var opt = document.createElement('option');
          opt.value = b.code;
          opt.textContent = b.name;
          select.appendChild(opt);
        });
        select.onchange = function () {
          if (hidden) hidden.value = select.value || '';
        };
        banksLoaded = true;
      })
      .catch(function () {
        select.innerHTML = '<option value="" disabled selected>Could not load banks</option>';
      });
  }

  // Open from cards
  document.querySelectorAll('[data-action-modal]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      openModal(btn.getAttribute('data-action-modal'));
    });
  });

  // Close controls
  root.addEventListener('click', function (e) {
    if (e.target.hasAttribute('data-close-modal') || e.target.classList.contains('db-modal-backdrop')) {
      closeModal();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && openModalEl) closeModal();
  });

  // Amount sanitize
  Array.prototype.forEach.call(root.querySelectorAll('input[name="amount"]'), function (input) {
    input.addEventListener('input', function () {
      var v = input.value.replace(/[^\d.]/g, '');
      var parts = v.split('.');
      if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('');
      if (parts[1] && parts[1].length > 2) v = parts[0] + '.' + parts[1].slice(0, 2);
      input.value = v;
    });
  });

  // Before wire/personal submit, sync bank code
  var wireForm = document.querySelector('#modal-wire form');
  if (wireForm) {
    wireForm.addEventListener('submit', function () {
      var bank = document.getElementById('wire-bank');
      var hidden = document.getElementById('wire-bank-code');
      if (bank && hidden) hidden.value = bank.value || '';
    });
  }
  var personalForm = document.querySelector('#modal-personal-bank form');
  if (personalForm) {
    personalForm.addEventListener('submit', function () {
      var bank = document.getElementById('personal-bank');
      var hidden = document.getElementById('personal-bank-code');
      if (bank && hidden) hidden.value = bank.value || '';
    });
  }

  // Submit button + full-screen popup loader
  Array.prototype.forEach.call(root.querySelectorAll('.db-modal__form'), function (form) {
    form.addEventListener('submit', function () {
      var btn = form.querySelector('.db-modal__btn--primary[type="submit"]');
      if (btn && !btn.disabled) {
        btn.disabled = true;
        btn.classList.add('is-loading');
        var original = btn.getAttribute('data-label') || btn.textContent.trim();
        btn.setAttribute('data-label', original);
        btn.innerHTML =
          '<span class="db-btn-spinner" aria-hidden="true"></span>' +
          '<span>Processing…</span>';
      }
      var msg = 'Processing your request';
      if (form.closest('#modal-wire')) msg = 'Submitting wire transfer';
      else if (form.closest('#modal-wallet')) msg = 'Sending to wallet';
      else if (form.closest('#modal-personal-bank')) msg = 'Transferring to personal bank';
      showPageLoader(msg);
    });
  });

})();