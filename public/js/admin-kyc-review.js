
'use strict';

(function () {
  var form = document.getElementById('kycr-form');
  if (!form) return;

  var reason = document.getElementById('kycr-reason');
  var reasonTag = document.getElementById('kycr-reason-tag');
  var countEl = document.getElementById('kycr-reason-count');
  var approveBtn = document.getElementById('kycr-approve');
  var rejectBtn = document.getElementById('kycr-reject');

  if (!reason || !reasonTag || !countEl || !approveBtn || !rejectBtn) {
    return;
  }

  var activeDecision = null;

  function updateReasonTag() {
    var hasText = reason.value.trim().length > 0;

    countEl.textContent = String(reason.value.length);

    if (activeDecision === 'reject' && !hasText) {
      reasonTag.textContent = 'required for rejection';
      reasonTag.classList.add('is-required');
    } else if (hasText) {
      reasonTag.textContent = 'provided';
      reasonTag.classList.remove('is-required');
    } else {
      reasonTag.textContent = 'optional for approval';
      reasonTag.classList.remove('is-required');
    }
  }

  reason.addEventListener('input', function () {
    reason.setCustomValidity('');
    reason.removeAttribute('aria-invalid');
    reason.style.borderColor = '';
    reason.style.boxShadow = '';
    updateReasonTag();
  });

  rejectBtn.addEventListener('mouseenter', function () {
    activeDecision = 'reject';
    updateReasonTag();
  });

  rejectBtn.addEventListener('focus', function () {
    activeDecision = 'reject';
    updateReasonTag();
  });

  rejectBtn.addEventListener('mouseleave', function () {
    if (document.activeElement !== rejectBtn) {
      activeDecision = null;
      updateReasonTag();
    }
  });

  rejectBtn.addEventListener('blur', function () {
    activeDecision = null;
    updateReasonTag();
  });

  approveBtn.addEventListener('mouseenter', function () {
    activeDecision = 'approve';
    updateReasonTag();
  });

  approveBtn.addEventListener('focus', function () {
    activeDecision = 'approve';
    updateReasonTag();
  });

  approveBtn.addEventListener('mouseleave', function () {
    if (document.activeElement !== approveBtn) {
      activeDecision = null;
      updateReasonTag();
    }
  });

  approveBtn.addEventListener('blur', function () {
    activeDecision = null;
    updateReasonTag();
  });

  form.addEventListener('submit', function (event) {
    var submitter = event.submitter;

    if (
      submitter &&
      submitter.name === 'decision' &&
      submitter.value === 'rejected' &&
      !reason.value.trim()
    ) {
      event.preventDefault();

      activeDecision = 'reject';
      reason.setCustomValidity('Enter a reason before rejecting this document.');
      reason.setAttribute('aria-invalid', 'true');
      reason.style.borderColor = '#dc2626';
      reason.style.boxShadow = '0 0 0 3px rgba(220, 38, 38, 0.12)';

      updateReasonTag();
      reason.reportValidity();
      reason.focus();
    }
  });

  updateReasonTag();
})();
