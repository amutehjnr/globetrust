'use strict';

(function () {
  var tabs = document.querySelectorAll('.sp-inbox-tab');
  var items = document.querySelectorAll('.sp-inbox-item');
  var noResults = document.getElementById('sp-inbox-no-results');

  if (!tabs.length || !items.length || !noResults) {
    return;
  }

  var currentFilter = 'all';

  function applyFilter() {
    var visibleCount = 0;

    items.forEach(function (item) {
      var matches =
        currentFilter === 'all' ||
        item.dataset.status === currentFilter;

      item.hidden = !matches;

      if (matches) {
        visibleCount += 1;
      }
    });

    noResults.hidden = visibleCount > 0;
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      currentFilter = tab.dataset.filter || 'all';

      tabs.forEach(function (otherTab) {
        var active = otherTab === tab;

        otherTab.classList.toggle('is-active', active);
        otherTab.setAttribute('aria-selected', String(active));
      });

      applyFilter();
    });
  });

  applyFilter();
})();