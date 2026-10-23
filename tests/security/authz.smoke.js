/**
 * Lightweight security smoke checks (no live server required for pure helpers).
 * Run: node tests/security/authz.smoke.js
 */
'use strict';

const assert = require('node:assert/strict');
const { isPositiveAmount, normalizeAmount } = require('../../src/utils/money');
const { sha256Hex } = require('../../src/utils/ids');

// Money must reject scientific notation / negatives
assert.equal(isPositiveAmount('100.50'), true);
assert.equal(isPositiveAmount('-1'), false);
assert.equal(isPositiveAmount('1e2'), false);
assert.equal(normalizeAmount('10.1', 2), '10.10');

// Idempotency / token hashing is deterministic
assert.equal(sha256Hex('abc'), sha256Hex('abc'));
assert.notEqual(sha256Hex('abc'), sha256Hex('abd'));

console.log('security smoke checks passed');
