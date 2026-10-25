
'use strict';

(function () {
  var bars = document.querySelectorAll('.adm-chart-bar[data-height]');

  bars.forEach(function (bar) {
    var height = Number.parseFloat(bar.getAttribute('data-height'));

    if (!Number.isFinite(height)) {
      height = 4;
    }

    height = Math.max(4, Math.min(100, height));

    bar.style.height = height + '%';
  });
})();
