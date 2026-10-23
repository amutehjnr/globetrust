'use strict';

/**
 * Shared shapes for core-banking adapters.
 * Real endpoint contracts must come from the bank’s official API documentation.
 */

module.exports = {
  PROVIDER_SANDBOX: 'sandbox_core',
  /** @typedef {{ accountRef: string, currency: string, available: string, ledger: string, asOf: string, isDemo: boolean }} BalanceSnapshot */
  /** @typedef {{ status: string, providerReference: string, rawStatus?: string }} TransferStatus */
};
