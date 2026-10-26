'use strict';

(function () {
  function log() {
    var args = ['[GLOBE_TRANSFER_UI]'].concat(Array.prototype.slice.call(arguments));
    if (typeof console !== 'undefined' && console.error) {
      console.error.apply(console, args);
    }
  }

  function fillBankSelect(select, list, country, source) {
    if (!select) return;
    log('fillBankSelect', {
      source: source,
      country: country,
      listLength: list ? list.length : 0,
      sample: (list || []).slice(0, 3)
    });

    if (!list || !list.length) {
      log('fillBankSelect aborted — empty list from', source);
      return;
    }

    var seen = {};
    Array.prototype.forEach.call(select.options, function (opt) {
      if (opt.value) seen[opt.value] = true;
    });

    var added = 0;
    list.forEach(function (bank) {
      if (!bank || !bank.code || seen[bank.code]) return;
      var option = document.createElement('option');
      option.value = bank.code;
      option.textContent = bank.name;
      select.appendChild(option);
      seen[bank.code] = true;
      added += 1;
    });

    log('fillBankSelect done', { added: added, totalOptions: select.options.length });

    var hint = document.getElementById('transfer-bank-hint');
    if (hint && country) {
      hint.textContent = 'Showing ' + list.length + ' banks for ' + country;
    }
  }

  function loadBanksFromApi() {
    var select = document.getElementById('transfer-bank');
    var hint = document.getElementById('transfer-bank-hint');
    if (!select) {
      log('ERROR: #transfer-bank not found');
      return;
    }

    log('fetching /app/transfers/banks');
    fetch('/app/transfers/banks', { credentials: 'same-origin' })
      .then(function (res) {
        log('banks API status', res.status, res.ok);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        log('banks API body', {
          countryCode: data.countryCode,
          profileCountry: data.profileCountry,
          count: data.count,
          sample: (data.banks || []).slice(0, 3)
        });
        fillBankSelect(select, data.banks || [], data.countryCode || '', 'api');
        if (data.countryCode) {
          select.setAttribute('data-country', data.countryCode);
        }
        if ((!data.banks || !data.banks.length) && hint) {
          hint.textContent =
            'No banks for country ' +
            (data.countryCode || data.profileCountry || '(none)') +
            ' — save country in Settings';
        }
      })
      .catch(function (err) {
        log('ERROR banks API', err && err.message ? err.message : err);
        if (hint) {
          hint.textContent =
            'Could not load banks. Save country in Settings, then refresh.';
        }
      });
  }

  function initTransferForm() {
    var form = document.getElementById('transfer-form');
    if (!form) return;

    var source = document.getElementById('transfer-source');
    var currencyEl = document.getElementById('transfer-currency');
    var amount = document.getElementById('transfer-amount');
    var destination = document.getElementById('transfer-destination');
    var destinationHint = document.getElementById('transfer-dest-hint');
    var narrative = document.getElementById('transfer-narrative');
    var narrativeHint = document.getElementById('transfer-narrative-hint');
    var summary = document.getElementById('transfer-summary');
    var summaryFrom = document.getElementById('sum-from');
    var summaryTo = document.getElementById('sum-to');
    var summaryAmount = document.getElementById('sum-amount');
    var bankSelect = document.getElementById('transfer-bank');

    log('page load', {
      hasForm: !!form,
      hasBankSelect: !!bankSelect,
      bankOptionCount: bankSelect ? bankSelect.options.length : 0,
      dataCountry: bankSelect ? bankSelect.getAttribute('data-country') : null
    });

    function getSelectedOption() {
      return source && source.options[source.selectedIndex]
        ? source.options[source.selectedIndex]
        : null;
    }

    function updateCurrency() {
      if (!currencyEl) return;
      var option = getSelectedOption();
      currencyEl.textContent = option
        ? option.getAttribute('data-currency') || '—'
        : '—';
    }

    function updateDestinationHint() {
      if (!destination || !destinationHint) return;
      var length = destination.value.trim().length;
      if (length === 0) {
        destinationHint.textContent = 'Minimum 4 characters';
        destinationHint.className = 'transfer-hint';
      } else if (length < 4) {
        destinationHint.textContent = length + ' / 4 characters';
        destinationHint.className = 'transfer-hint transfer-hint-warn';
      } else {
        destinationHint.textContent = 'Check the destination details carefully';
        destinationHint.className = 'transfer-hint transfer-hint-ok';
      }
    }

    function updateNarrativeCounter() {
      if (!narrative || !narrativeHint) return;
      narrativeHint.textContent = narrative.value.length + ' / 140';
    }

    function updateSummary() {
      if (!summary || !summaryFrom || !summaryTo || !summaryAmount) return;
      if (!amount || !destination || !currencyEl) return;

      var parsedAmount = Number(amount.value);
      var destinationValue = destination.value.trim();
      var option = getSelectedOption();

      if (
        !option ||
        !Number.isFinite(parsedAmount) ||
        parsedAmount <= 0 ||
        destinationValue.length < 4
      ) {
        summary.hidden = true;
        return;
      }

      var currency = currencyEl.textContent;
      var formattedAmount = parsedAmount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });

      summaryFrom.textContent = option.textContent.trim();
      summaryTo.textContent = destinationValue;
      summaryAmount.textContent = formattedAmount + ' ' + currency;
      summary.hidden = false;
    }

    if (source) {
      source.addEventListener('change', function () {
        updateCurrency();
        updateSummary();
      });
    }

    if (amount) {
      amount.addEventListener('input', function () {
        var value = amount.value.replace(/[^\d.]/g, '');
        var parts = value.split('.');
        if (parts.length > 2) {
          value = parts.shift() + '.' + parts.join('');
        }
        var decimalParts = value.split('.');
        if (decimalParts.length === 2) {
          value = decimalParts[0] + '.' + decimalParts[1].slice(0, 2);
        }
        amount.value = value;
        updateSummary();
      });
    }

    if (destination) {
      destination.addEventListener('input', function () {
        updateDestinationHint();
        updateSummary();
      });
    }

    if (narrative) {
      narrative.addEventListener('input', updateNarrativeCounter);
    }

    form.addEventListener('submit', function (event) {
      if (!amount || !destination) return;
      var parsedAmount = Number(amount.value);
      var destinationValue = destination.value.trim();
      if (
        !Number.isFinite(parsedAmount) ||
        parsedAmount <= 0 ||
        destinationValue.length < 4
      ) {
        event.preventDefault();
        if (parsedAmount <= 0 && amount) amount.focus();
        else if (destination) destination.focus();
      }
    });

    updateCurrency();
    updateDestinationHint();
    updateNarrativeCounter();
    updateSummary();

    // Always load banks from API (CSP-safe, no inline scripts)
    loadBanksFromApi();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTransferForm);
  } else {
    initTransferForm();
  }
})();