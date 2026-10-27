'use strict';

(function () {
  var root = document.getElementById('db-translator');
  var select = document.getElementById('db-language');
  var trigger = document.getElementById('lang-trigger');
  var triggerLabel = document.getElementById('lang-trigger-label');
  var panel = document.getElementById('lang-panel');
  var list = document.getElementById('lang-list');
  var search = document.getElementById('lang-search');

  if (!root || !select) return;

  // Never let Google Translate rewrite language picker labels
  root.classList.add('notranslate');
  root.setAttribute('translate', 'no');
  if (document.documentElement) {
    /* picker is excluded via notranslate */
  }


  var csrf = root.getAttribute('data-csrf') || select.getAttribute('data-csrf') || '';
  var STORAGE_KEY = 'globetrust_lang';

  function readStoredLang() {
    try {
      var ls = localStorage.getItem(STORAGE_KEY);
      if (ls) return ls;
    } catch (_) {}
    var cookie = '';
    try {
      var m = document.cookie.match(/(?:^|; )googtrans=([^;]*)/);
      if (m) {
        var parts = decodeURIComponent(m[1]).split('/');
        if (parts.length >= 3 && parts[2]) return parts[2];
      }
    } catch (_) {}
    return '';
  }

  var fromServer = (root.getAttribute('data-initial-lang') || '').trim();
  var fromStore = readStoredLang();
  var current = (fromStore || fromServer || select.value || 'en').trim() || 'en';

  var LABELS = {};
  Array.prototype.forEach.call(list ? list.querySelectorAll('.lang-item') : [], function (btn) {
    LABELS[btn.getAttribute('data-lang')] = btn.getAttribute('data-label') || btn.getAttribute('data-lang');
  });
  LABELS.en = 'English';

  function hostDomain() {
    var h = location.hostname || '';
    var parts = h.split('.');
    if (parts.length >= 2) return parts.slice(-2).join('.');
    return h;
  }

  function writeCookie(name, value) {
    var base = name + '=' + value + ';path=/;max-age=31536000;SameSite=Lax';
    document.cookie = base;
    var d = hostDomain();
    if (d) document.cookie = base + ';domain=.' + d;
  }

  function eraseCookie(name) {
    var expires = name + '=;path=/;max-age=0;expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = expires;
    var d = hostDomain();
    if (d) document.cookie = expires + ';domain=.' + d;
  }

  function persistLocale(lang) {
    if (!csrf) return;
    var body = new URLSearchParams();
    body.set('_csrf', csrf);
    body.set('locale', lang);
    fetch('/app/profile/locale', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body: body.toString()
    }).catch(function () {});
  }

  function setTriggerLabel(lang) {
    if (triggerLabel) {
      // Always show canonical label — never a translated word like "Inglés"
      if (lang === 'en') {
        triggerLabel.textContent = 'English';
      } else {
        triggerLabel.textContent = LABELS[lang] || lang || 'English';
      }
    }
    Array.prototype.forEach.call(list ? list.querySelectorAll('.lang-item') : [], function (btn) {
      var on = btn.getAttribute('data-lang') === lang;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    // Keep native select in sync (for form/state)
    if (select) {
      select.value = lang;
      // Ensure English option always present
      if (lang === 'en' && select.value !== 'en') {
        var enOpt = select.querySelector('option[value="en"]');
        if (enOpt) enOpt.selected = true;
      }
    }
  }

  function openPanel() {
    if (!panel || !trigger) return;
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    root.classList.add('is-open');
    if (search) {
      search.value = '';
      filterList('');
      setTimeout(function () { search.focus(); }, 0);
    }
  }

  function closePanel() {
    if (!panel || !trigger) return;
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    root.classList.remove('is-open');
  }

  function filterList(q) {
    q = String(q || '').toLowerCase().trim();
    Array.prototype.forEach.call(list.querySelectorAll('.lang-item'), function (btn) {
      var native = (btn.querySelector('.lang-item__native') || {}).textContent || '';
      var eng = (btn.querySelector('.lang-item__en') || {}).textContent || '';
      var code = btn.getAttribute('data-lang') || '';
      var show = !q ||
        native.toLowerCase().indexOf(q) !== -1 ||
        eng.toLowerCase().indexOf(q) !== -1 ||
        code.toLowerCase().indexOf(q) !== -1;
      btn.classList.toggle('is-hidden', !show);
    });
  }

  function ensureWidget() {
    var el = document.getElementById('google_translate_element');
    if (!el) {
      el = document.createElement('div');
      el.id = 'google_translate_element';
      el.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;';
      document.body.appendChild(el);
    }
    return el;
  }

  function injectScript() {
    if (document.getElementById('google-translate-script')) return;
    var s = document.createElement('script');
    s.id = 'google-translate-script';
    s.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    s.async = true;
    document.body.appendChild(s);
  }

  window.googleTranslateElementInit = function () {
    ensureWidget();
    try {
      // eslint-disable-next-line no-new
      new google.translate.TranslateElement(
        { pageLanguage: 'en', autoDisplay: false, multilanguagePage: true },
        'google_translate_element'
      );
    } catch (e) {
      console.error('[GLOBE_TRANSLATOR] init', e);
    }
    if (current && current !== 'en') {
      setTimeout(function () { triggerCombo(current); }, 400);
    }
  };

  function triggerCombo(lang) {
    var combo = document.querySelector('select.goog-te-combo');
    if (!combo) return false;
    combo.value = lang;
    combo.dispatchEvent(new Event('change'));
    return true;
  }

  function applyLanguage(lang) {
    current = lang || 'en';
    setTriggerLabel(current);
    persistLocale(current);
    try { localStorage.setItem(STORAGE_KEY, current); } catch (_) {}
    closePanel();

    if (current === 'en') {
      eraseCookie('googtrans');
      if (document.documentElement.className.indexOf('translated') !== -1) {
        location.reload();
        return;
      }
      triggerCombo('en');
      return;
    }

    writeCookie('googtrans', '/en/' + current);
    ensureWidget();
    injectScript();

    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (triggerCombo(current) || tries >= 15) {
        clearInterval(timer);
        if (tries >= 15) location.reload();
      }
    }, 250);
  }

  // UI events
  if (trigger) {
    trigger.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (panel && panel.hidden) openPanel();
      else closePanel();
    });
  }

  if (list) {
    list.addEventListener('click', function (e) {
      var btn = e.target.closest('.lang-item');
      if (!btn) return;
      applyLanguage(btn.getAttribute('data-lang') || 'en');
    });
  }

  if (search) {
    search.addEventListener('input', function () {
      filterList(search.value);
    });
    search.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closePanel();
        if (trigger) trigger.focus();
      }
    });
  }

  document.addEventListener('click', function (e) {
    if (root && !root.contains(e.target)) closePanel();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closePanel();
  });

  // Prefer profile locale from select, default English (always visible)
  if (!select.querySelector('option[value="en"]')) {
    var o = document.createElement('option');
    o.value = 'en';
    o.textContent = 'English';
    select.insertBefore(o, select.firstChild);
  }
  if (!current || current === '') current = 'en';
  select.value = current;
  try { localStorage.setItem(STORAGE_KEY, current); } catch (_) {}
  setTriggerLabel(current);
  if (triggerLabel && current === 'en') triggerLabel.textContent = 'English';

  
  function reassertLabel() {
    if (!triggerLabel) return;
    if (current === 'en') triggerLabel.textContent = 'English';
    else if (LABELS[current]) triggerLabel.textContent = LABELS[current];
  }

  // Google may rewrite nodes after translate — push our labels back
  setInterval(reassertLabel, 1500);

  ensureWidget();
  injectScript();
  if (current !== 'en') {
    writeCookie('googtrans', '/en/' + current);
  }
})();