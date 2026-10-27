'use strict';

/**
 * Reliable page translator using Google Translate.
 * Strategy: set googtrans cookie + load element.js; reload when needed.
 */
(function () {
  var select = document.getElementById('db-language');
  if (!select) return;

  var csrf = select.getAttribute('data-csrf') || '';
  var current = (select.value || 'en').trim();

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
    if (d) {
      document.cookie = base + ';domain=.' + d;
    }
  }

  function eraseCookie(name) {
    var expires = name + '=;path=/;max-age=0;expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = expires;
    var d = hostDomain();
    if (d) document.cookie = expires + ';domain=.' + d;
    document.cookie = name + '=;path=/;max-age=0;domain=' + location.hostname;
  }

  function readCookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
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

  function ensureWidget() {
    var el = document.getElementById('google_translate_element');
    if (!el) {
      el = document.createElement('div');
      el.id = 'google_translate_element';
      el.setAttribute('aria-hidden', 'true');
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
        {
          pageLanguage: 'en',
          autoDisplay: false,
          multilanguagePage: true
        },
        'google_translate_element'
      );
    } catch (e) {
      console.error('[GLOBE_TRANSLATOR] init error', e);
    }

    // If a non-English language is selected, push it into the hidden combo
    if (current && current !== 'en') {
      setTimeout(function () {
        triggerCombo(current);
      }, 400);
    }
  };

  function triggerCombo(lang) {
    var combo = document.querySelector('select.goog-te-combo');
    if (!combo) return false;
    if (combo.value !== lang) {
      combo.value = lang;
      combo.dispatchEvent(new Event('change'));
    }
    return true;
  }

  function applyLanguage(lang, opts) {
    opts = opts || {};
    current = lang;
    persistLocale(lang);

    if (lang === 'en') {
      eraseCookie('googtrans');
      // If page is already translated, reload to restore original
      if (
        opts.forceReload ||
        document.documentElement.className.indexOf('translated') !== -1 ||
        readCookie('googtrans')
      ) {
        eraseCookie('googtrans');
        location.reload();
        return;
      }
      triggerCombo('en');
      return;
    }

    // Set cookie Google Translate reads on load
    writeCookie('googtrans', '/en/' + lang);

    ensureWidget();
    injectScript();

    // Try live switch without reload first
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (triggerCombo(lang)) {
        clearInterval(timer);
        return;
      }
      if (tries >= 15) {
        clearInterval(timer);
        // Cookie is set — full reload applies translation reliably
        location.reload();
      }
    }, 250);
  }

  select.addEventListener('change', function () {
    applyLanguage(select.value || 'en', { forceReload: false });
  });

  // Boot: always load widget; re-apply saved language
  ensureWidget();
  injectScript();

  if (current && current !== 'en') {
    // Cookie may already exist; ensure it matches the select
    writeCookie('googtrans', '/en/' + current);
  }
})();