'use strict';

(function () {
  function initialsFromName(name, code) {
    var src = String(name || code || '?').trim();
    var parts = src.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
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
    return img;
  }

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
      } else avatarFallback.hidden = false;
    } else avatarFallback.hidden = false;
    wrap.appendChild(avatarFallback);
    return wrap;
  }

  function setTriggerContent(triggerMain, bank) {
    triggerMain.innerHTML = '';
    if (!bank || !bank.code) {
      var ph = document.createElement('span');
      ph.className = 'bank-picker__placeholder';
      ph.textContent = 'Select source bank';
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

  function initBankPicker(banks, countryCode) {
    var select = document.getElementById('deposit-bank');
    var picker = document.getElementById('bank-picker');
    var trigger = document.getElementById('bank-picker-trigger');
    var triggerMain = document.getElementById('bank-picker-selected');
    var panel = document.getElementById('bank-picker-panel');
    var listEl = document.getElementById('bank-picker-list');
    var search = document.getElementById('bank-picker-search');
    var hint = document.getElementById('transfer-bank-hint');
    if (!select || !picker || !trigger || !panel || !listEl) return;

    banks = (banks || []).map(function (b) {
      return {
        code: b.code,
        name: b.name,
        logoUrl: b.logoUrl || '',
        avatarUrl: b.avatarUrl || '',
        initials: b.initials || initialsFromName(b.name, b.code)
      };
    });

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
      Array.prototype.forEach.call(select.options, function (opt) {
        opt.selected = opt.value === bank.code;
      });
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

    listEl.innerHTML = '';
    banks.forEach(function (bank) {
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bank-picker__item' + (bank.code === selectedCode ? ' is-selected' : '');
      btn.setAttribute('data-code', bank.code);
      btn.setAttribute('data-name', bank.name.toLowerCase());
      btn.appendChild(buildBankLogo(bank));
      var meta = document.createElement('span');
      meta.className = 'bank-picker__meta';
      var name = document.createElement('span');
      name.className = 'bank-picker__name';
      name.textContent = bank.name;
      meta.appendChild(name);
      btn.appendChild(meta);
      btn.addEventListener('click', function () { onPick(bank); });
      li.appendChild(btn);
      listEl.appendChild(li);
    });

    trigger.addEventListener('click', function (e) {
      e.preventDefault();
      if (panel.hidden) openPanel();
      else closePanel();
    });
    if (search) search.addEventListener('input', function () { filterList(search.value); });
    document.addEventListener('click', function (e) {
      if (!picker.contains(e.target)) closePanel();
    });

    if (hint && countryCode && banks.length) {
      hint.innerHTML = 'Showing <strong>' + banks.length + '</strong> banks for <strong>' + countryCode + '</strong>';
    }
  }

  function loadBanks() {
    var select = document.getElementById('deposit-bank');
    if (!select) return;
    fetch('/app/transfers/banks', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        initBankPicker(data.banks || [], data.countryCode || select.getAttribute('data-country') || '');
      })
      .catch(function () {
        var list = [];
        Array.prototype.forEach.call(select.options, function (opt) {
          if (!opt.value) return;
          list.push({
            code: opt.value,
            name: opt.textContent.trim(),
            logoUrl: opt.getAttribute('data-logo') || '',
            avatarUrl: opt.getAttribute('data-avatar') || '',
            initials: opt.getAttribute('data-initials') || ''
          });
        });
        initBankPicker(list, select.getAttribute('data-country') || '');
      });
  }

  function init() {
    var account = document.getElementById('deposit-account');
    var currencyEl = document.getElementById('deposit-currency');
    var amount = document.getElementById('deposit-amount');

    function updateCurrency() {
      if (!account || !currencyEl) return;
      var opt = account.options[account.selectedIndex];
      currencyEl.textContent = opt ? (opt.getAttribute('data-currency') || '—') : '—';
    }

    if (account) account.addEventListener('change', updateCurrency);
    if (amount) {
      amount.addEventListener('input', function () {
        var v = amount.value.replace(/[^\d.]/g, '');
        var parts = v.split('.');
        if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('');
        if (parts[1] && parts[1].length > 2) v = parts[0] + '.' + parts[1].slice(0, 2);
        amount.value = v;
      });
    }
    updateCurrency();
    loadBanks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();