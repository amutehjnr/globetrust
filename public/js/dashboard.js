
'use strict';

document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.db-chart__bar[data-height]').forEach(function (bar) {
    var height = Number.parseFloat(bar.dataset.height);

    if (!Number.isFinite(height)) {
      height = 4;
    }

    bar.style.height = Math.max(4, Math.min(100, height)) + '%';
  });
});
