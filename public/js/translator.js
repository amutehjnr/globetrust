'use strict';

(function () {
  var select = document.getElementById('db-language');
  if (!select) return;

  var csrf = select.getAttribute('data-csrf') || '';

  function setGoogTransCookie(lang) {
    if (!lang || lang === 'en') {
      document.cookie = 'googtrans=;path=/;max-age=0';
      document.cookie = 'googtrans=;path=/;domain=' + location.hostname + ';max-age=0';
      return;
    }
    var value = '/en/' + lang;
    document.cookie = 'googtrans=' + value + ';path=/';
    document.cookie = 'googtrans=' + value + ';path=/;domain=' + location.hostname;
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

  function loadGoogleTranslate(lang) {
    if (lang === 'en') {
      // Clear translation
      setGoogTransCookie('en');
      if (document.documentElement.classList.contains('translated-ltr') ||
          document.documentElement.classList.contains('translated-rtl')) {
        location.reload();
      }
      return;
    }

    setGoogTransCookie(lang);

    function triggerCombo() {
      var combo = document.querySelector('.goog-te-combo');
      if (combo) {
        combo.value = lang;
        combo.dispatchEvent(new Event('change'));
        return true;
      }
      return false;
    }

    if (window.google && window.google.translate) {
      triggerCombo();
      return;
    }

    window.googleTranslateElementInit = function () {
      // eslint-disable-next-line no-new
      new window.google.translate.TranslateElement(
        {
          pageLanguage: 'en',
          includedLanguages: 'en,fr,es,pt,ar,zh-CN,de,hi,yo,ha,ig',
          autoDisplay: false
        },
        'google_translate_element'
      );
      var tries = 0;
      var t = setInterval(function () {
        tries += 1;
        if (triggerCombo() || tries > 20) clearInterval(t);
      }, 150);
    };

    if (!document.getElementById('google-translate-script')) {
      var s = document.createElement('script');
      s.id = 'google-translate-script';
      s.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
      document.body.appendChild(s);
    }
  }

  select.addEventListener('change', function () {
    var lang = select.value || 'en';
    persistLocale(lang);
    loadGoogleTranslate(lang);
  });

  // Apply saved non-English locale on load
  if (select.value && select.value !== 'en') {
    loadGoogleTranslate(select.value);
  }
})();