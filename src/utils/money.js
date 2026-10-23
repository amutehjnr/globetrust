'use strict';

/**
 * Decimal-safe helpers for display and basic validation.
 * Prefer DECIMAL in MySQL; avoid floating-point for stored money.
 */
function isPositiveAmount(str) {
  if (typeof str !== 'string' && typeof str !== 'number') return false;
  const s = String(str).trim();
  if (!/^\d+(\.\d{1,8})?$/.test(s)) return false;
  return Number(s) > 0;
}

function normalizeAmount(str, minorUnits = 2) {
  const n = Number(str);
  if (!(n > 0) || Number.isNaN(n)) return null;
  return n.toFixed(minorUnits);
}

module.exports = { isPositiveAmount, normalizeAmount };
