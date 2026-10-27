'use strict';

/**
 * Page translator via Google Translate Element.
 * Language is chosen in #db-language; page content is translated client-side.
 */
(function () {
  var select = document.getElementById('db-language');
  if (!select) return;

  var csrf = select.getAttribute('data-csrf') || '';
  var HOST = location.hostname;
  var loadingScript = false;

  function setCookie(name, value, days) {
    var maxAge = typeof days === 'number' ? ';max-age=' + days * 86400 : '';
    document.cookie = name + '=' + value + ';path=/' + maxAge;
    // Also set on bare domain variants Google sometimes reads
    if (HOST && HOST.indexOf('.') !== -1) {
      document.cookie = name + '=' + value + ';path=/;domain=.' + HOST + maxAge;
    }
  }

  function clearGoogTrans() {
    setCookie('googtrans', '', -1);
    document.cookie = 'googtrans=;path=/;max-age=0';
    document.cookie = 'googtrans=;path=/;domain=' + HOST + ';max-age=0';
    document.cookie = 'googtrans=;path=/;domain=.' + HOST + ';max-age=0';
  }

  function setGoogTrans(lang) {
    if (!lang || lang === 'en') {
      clearGoogTrans();
      return;
    }
    var value = '/en/' + lang;
    setCookie('googtrans', value, 365);
  }

  function persistLocale(lang) {
    if (!csrf) return;
    try {
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
    } catch (_) {}
  }

  function findCombo() {
    return (
      document.querySelector('.goog-te-combo') ||
      document.querySelector('select.goog-te-combo')
    );
  }

  function applyCombo(lang) {
    var combo = findCombo();
    if (!combo) return false;
    if (lang === 'en') {
      // Reset to original
      combo.value = 'en';
      combo.dispatchEvent(new Event('change'));
      return true;
    }
    // Ensure option exists
    var has = false;
    for (var i = 0; i < combo.options.length; i += 1) {
      if (combo.options[i].value === lang) {
        has = true;
        break;
      }
    }
    if (!has) {
      var opt = document.createElement('option');
      opt.value = lang;
      opt.textContent = lang;
      combo.appendChild(opt);
    }
    combo.value = lang;
    combo.dispatchEvent(new Event('change'));
    return true;
  }

  function ensureTranslateElement(cb) {
    if (window.google && window.google.translate && window.google.translate.TranslateElement) {
      if (!document.getElementById('google_translate_element')) {
        var d = document.createElement('div');
        d.id = 'google_translate_element';
        d.style.display = 'none';
        document.body.appendChild(d);
      }
      if (!document.querySelector('.goog-te-combo')) {
        try {
          // eslint-disable-next-line no-new
          new window.google.translate.TranslateElement(
            {
              pageLanguage: 'en',
              autoDisplay: false,
              multilanguagePage: false
            },
            'google_translate_element'
          );
        } catch (_) {}
      }
      cb();
      return;
    }

    if (loadingScript) {
      var waits = 0;
      var t = setInterval(function () {
        waits += 1;
        if ((window.google && window.google.translate) || waits > 40) {
          clearInterval(t);
          if (window.google && window.google.translate) ensureTranslateElement(cb);
        }
      }, 200);
      return;
    }

    loadingScript = true;
    window.googleTranslateElementInit = function () {
      if (!document.getElementById('google_translate_element')) {
        var hold = document.createElement('div');
        hold.id = 'google_translate_element';
        hold.style.display = 'none';
        document.body.appendChild(hold);
      }
      try {
        // eslint-disable-next-line no-new
        new window.google.translate.TranslateElement(
          {
            pageLanguage: 'en',
            autoDisplay: false,
            multilanguagePage: false
          },
          'google_translate_element'
        );
      } catch (_) {}
      cb();
    };

    var s = document.createElement('script');
    s.id = 'google-translate-script';
    s.async = true;
    s.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    s.onerror = function () {
      loadingScript = false;
      console.error('[GLOBE_TRANSLATOR] Failed to load Google Translate script');
    };
    document.body.appendChild(s);
  }

  function translateTo(lang) {
    persistLocale(lang);

    if (lang === 'en') {
      setGoogTrans('en');
      clearGoogTrans();
      // Hard reload clears translation frame state reliably
      if (
        document.documentElement.classList.contains('translated-ltr') ||
        document.documentElement.classList.contains('translated-rtl') ||
        document.querySelector('.skiptranslate')
      ) {
        location.reload();
        return;
      }
      ensureTranslateElement(function () {
        applyCombo('en');
      });
      return;
    }

    setGoogTrans(lang);
    ensureTranslateElement(function () {
      var tries = 0;
      var timer = setInterval(function () {
        tries += 1;
        if (applyCombo(lang) || tries > 25) {
          clearInterval(timer);
          // Fallback: cookie + reload forces Google TE to apply
          if (tries > 25) {
            location.reload();
          }
        }
      }, 200);
    });
  }

  select.addEventListener('change', function () {
    translateTo(select.value || 'en');
  });

  // Restore saved language on load
  var initial = select.value || 'en';
  if (initial && initial !== 'en') {
    // Small delay so DOM is ready
    setTimeout(function () {
      translateTo(initial);
    }, 300);
  }
})();