'use strict';

const { SandboxCoreAdapter } = require('./SandboxCoreAdapter');
const { ManualCoreAdapter } = require('./ManualCoreAdapter');
const logger = require('../../config/logger');

/**
 * Core-banking adapter factory.
 * - manual  (default): accept transfers for offline/staff processing — no sandbox branding
 * - sandbox: local demo ledger (legacy)
 * Live PSP adapters can be added later (Paystack, Flutterwave, bank API, etc.)
 */
function createCoreBankingAdapter() {
  const mode = (process.env.CORE_BANKING_MODE || 'manual').toLowerCase();

  if (mode === 'manual' || mode === 'live_manual' || mode === 'production') {
    logger.info({ mode: 'manual' }, 'Core banking: manual processing mode');
    return new ManualCoreAdapter({ logger });
  }

  if (mode === 'sandbox' || mode === 'demo') {
    logger.info({ mode: 'sandbox' }, 'Core banking: sandbox adapter');
    return new SandboxCoreAdapter({ logger });
  }

  throw new Error(
    `CORE_BANKING_MODE="${mode}" is not configured. Use "manual" (default) or "sandbox".`
  );
}

module.exports = { createCoreBankingAdapter };