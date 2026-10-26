'use strict';

(function () {
  function log() {
    var args = ['[GLOBE_TRANSFER_UI]'].concat(Array.prototype.slice.call(arguments));
    if (typeof console !== 'undefined' && console.error) {
      console.error.apply(console, args);
    }
  }

  function initialsFromName(name, code) {
    var src = String(name || code || '?').trim();
    var parts = src.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return src.slice(0, 2).toUpperCase();
  }

  function logoImg(url, className, alt) {
    if (!url) return null;
    var img = document.createElement('img');
    img.className = className;
    img.src = url;
    img.alt = alt || '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', function () {
      img.style.display = 'none';
      if (img.nextElementSibling && img.nextElementSibling.classList.contains('bank-picker__avatar')) {
        img.nextElementSibling.hidden = false;
      }
    });
    return img;
  }

  /** Bank logo only — country flags are NOT shown on bank rows. */
  function buildBankLogo(bank) {
    var wrap = document.createElement('span');
    wrap.className = 'bank-picker__logos';

    var avatarFallback = document.createElement('span');
    avatarFallback.className = 'bank-picker__avatar';
    avatarFallback.textContent = bank.initials || initialsFromName(bank.name, bank.code);
    avatarFallback.hidden = true;

    var logoSrc = bank.logoUrl || bank.avatarUrl || '';
    var avatarSrc = bank.avatarUrl || '';

    if (logoSrc) {
      var logo = logoImg(logoSrc, 'bank-picker__logo', bank.name || '');
      if (logo) {
        logo.addEventListener('error', function () {
          if (avatarSrc && avatarSrc !== logoSrc) {
            logo.src = avatarSrc;
            logo.onerror = function () {
              logo.style.display = 'none';
              avatarFallback.hidden = false;
            };
          } else {
            logo.style.display = 'none';
            avatarFallback.hidden = false;
          }
        });
        wrap.appendChild(logo);
      } else {
        avatarFallback.hidden = false;
      }
    } else {
      avatarFallback.hidden = false;
    }
    wrap.appendChild(avatarFallback);
    return wrap;
  }

  function setTriggerContent(triggerMain, bank) {
    triggerMain.innerHTML = '';
    if (!bank || !bank.code) {
      var ph = document.createElement('span');
      ph.className = 'bank-picker__placeholder';
      ph.textContent = 'Select destination bank';
      triggerMain.appendChild(ph);
      return;
    }
    triggerMain.appendChild(buildBankLogo(bank));
    var meta = document.createElement('span');
    meta.className = 'bank-picker__meta';
    var name = document.createElement('span');
    name.className = 'bank-picker__name';
    name.textContent = bank.name;
    meta.appendChild(name);
    triggerMain.appendChild(meta);
  }

  function syncNativeSelect(select, code) {
    if (!select) return;
    var found = false;
    Array.prototype.forEach.call(select.options, function (opt) {
      if (opt.value === code) {
        opt.selected = true;
        found = true;
      } else {
        opt.selected = false;
      }
    });
    if (!found && select.options[0]) {
      select.options[0].selected = true;
    }
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function banksFromSelectOptions(select) {
    var list = [];
    Array.prototype.forEach.call(select.options, function (opt) {
      if (!opt.value) return;
      list.push({
        code: opt.value,
        name: opt.textContent.trim(),
        logoUrl: opt.getAttribute('data-logo') || '',
        avatarUrl: opt.getAttribute('data-avatar') || '',
        initials: opt.getAttribute('data-initials') || initialsFromName(opt.textContent, opt.value)
      });
    });
    return list;
  }

  function renderBankList(listEl, banks, selectedCode, onPick) {
    listEl.innerHTML = '';
    if (!banks.length) {
      var empty = document.createElement('li');
      empty.className = 'bank-picker__empty';
      empty.textContent = 'No banks found';
      listEl.appendChild(empty);
      return;
    }

    banks.forEach(function (bank) {
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bank-picker__item' + (bank.code === selectedCode ? ' is-selected' : '');
      btn.setAttribute('role', 'option');
      btn.setAttribute('data-code', bank.code);
      btn.setAttribute('data-name', bank.name.toLowerCase());
      btn.appendChild(buildBankLogo(bank));

      var meta = document.createElement('span');
      meta.className = 'bank-picker__meta';
      var name = document.createElement('span');
      name.className = 'bank-picker__name';
      name.textContent = bank.name;
      var code = document.createElement('span');
      code.className = 'bank-picker__code';
      code.textContent = bank.code;
      meta.appendChild(name);
      meta.appendChild(code);
      btn.appendChild(meta);

      btn.addEventListener('click', function () {
        onPick(bank);
      });

      li.appendChild(btn);
      listEl.appendChild(li);
    });
  }

  function initBankPicker(banks, countryCode, countryFlagUrl) {
    var select = document.getElementById('transfer-bank');
    var picker = document.getElementById('bank-picker');
    var trigger = document.getElementById('bank-picker-trigger');
    var triggerMain = document.getElementById('bank-picker-selected');
    var panel = document.getElementById('bank-picker-panel');
    var listEl = document.getElementById('bank-picker-list');
    var search = document.getElementById('bank-picker-search');
    var hint = document.getElementById('transfer-bank-hint');

    if (!select || !picker || !trigger || !panel || !listEl) {
      log('bank picker DOM missing');
      return;
    }

    // Normalize banks with flag fallback
    banks = (banks || []).map(function (b) {
      return {
        code: b.code,
        name: b.name,
        logoUrl: b.logoUrl || '',
        avatarUrl: b.avatarUrl || '',
        initials: b.initials || initialsFromName(b.name, b.code)
      };
    });

    // Rebuild native options for form submit
    var prev = select.value;
    while (select.options.length > 1) select.remove(1);
    banks.forEach(function (b) {
      var opt = document.createElement('option');
      opt.value = b.code;
      opt.textContent = b.name;
      opt.setAttribute('data-logo', b.logoUrl || '');
      opt.setAttribute('data-avatar', b.avatarUrl || '');
      opt.setAttribute('data-initials', b.initials || '');
      if (prev && prev === b.code) opt.selected = true;
      select.appendChild(opt);
    });

    var selectedCode = select.value || '';
    var selectedBank = banks.find(function (b) { return b.code === selectedCode; }) || null;
    setTriggerContent(triggerMain, selectedBank);

    function closePanel() {
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }

    function openPanel() {
      panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      if (search) {
        search.value = '';
        filterList('');
        setTimeout(function () { search.focus(); }, 0);
      }
    }

    function onPick(bank) {
      selectedCode = bank.code;
      selectedBank = bank;
      setTriggerContent(triggerMain, bank);
      syncNativeSelect(select, bank.code);
      Array.prototype.forEach.call(listEl.querySelectorAll('.bank-picker__item'), function (el) {
        el.classList.toggle('is-selected', el.getAttribute('data-code') === bank.code);
      });
      closePanel();
    }

    function filterList(q) {
      q = String(q || '').toLowerCase().trim();
      var visible = 0;
      Array.prototype.forEach.call(listEl.querySelectorAll('.bank-picker__item'), function (el) {
        var name = el.getAttribute('data-name') || '';
        var code = (el.getAttribute('data-code') || '').toLowerCase();
        var show = !q || name.indexOf(q) !== -1 || code.indexOf(q) !== -1;
        el.parentElement.classList.toggle('is-hidden', !show);
        if (show) visible += 1;
      });
      var empty = listEl.querySelector('.bank-picker__empty');
      if (empty) empty.remove();
      if (!visible) {
        var li = document.createElement('li');
        li.className = 'bank-picker__empty';
        li.textContent = 'No banks match your search';
        listEl.appendChild(li);
      }
    }

    renderBankList(listEl, banks, selectedCode, onPick);

    trigger.addEventListener('click', function (e) {
      e.preventDefault();
      if (panel.hidden) openPanel();
      else closePanel();
    });

    if (search) {
      search.addEventListener('input', function () {
        filterList(search.value);
      });
      search.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          closePanel();
          trigger.focus();
        }
      });
    }

    document.addEventListener('click', function (e) {
      if (!picker.contains(e.target)) closePanel();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) closePanel();
    });

    if (hint && countryCode && banks.length) {
      hint.innerHTML = 'Showing <strong>' + banks.length + '</strong> banks for <strong>' + countryCode + '</strong>';
    }

    log('bank picker ready', { count: banks.length, countryCode: countryCode });
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
        var banks = data.banks || [];
        if (!banks.length) {
          banks = banksFromSelectOptions(select);
        }
        initBankPicker(banks, data.countryCode || select.getAttribute('data-country') || '', data.countryFlagUrl || '');
        if (data.countryCode) select.setAttribute('data-country', data.countryCode);
      })
      .catch(function (err) {
        log('ERROR banks API', err && err.message ? err.message : err);
        var fallback = banksFromSelectOptions(select);
        initBankPicker(fallback, select.getAttribute('data-country') || '', '');
        if (hint && !fallback.length) {
          hint.textContent = 'Could not load banks. Save country in Settings, then refresh.';
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
      var bank = document.getElementById('transfer-bank');
      if (bank && !bank.value) {
        event.preventDefault();
        var trigger = document.getElementById('bank-picker-trigger');
        if (trigger) trigger.focus();
        return;
      }
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
    loadBanksFromApi();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTransferForm);
  } else {
    initTransferForm();
  }
})();