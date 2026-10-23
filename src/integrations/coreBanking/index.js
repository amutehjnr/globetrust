'use strict';

const { SandboxCoreAdapter } = require('./SandboxCoreAdapter');
const logger = require('../../config/logger');

/**
 * Factory: only sandbox is shipped.
 * Production adapters must be supplied by the bank’s integration team using official docs.
 */
function createCoreBankingAdapter() {
  const mode = process.env.CORE_BANKING_MODE || 'sandbox';
  if (mode === 'sandbox') {
    return new SandboxCoreAdapter({ logger });
  }
  throw new Error(
    `CORE_BANKING_MODE="${mode}" is not configured. Only "sandbox" is available in this scaffold.`
  );
}

module.exports = { createCoreBankingAdapter };
