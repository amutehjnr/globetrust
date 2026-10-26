'use strict';

const crypto = require('node:crypto');
const { PROVIDER_MANUAL } = require('./types');

/**
 * Manual operations mode — no sandbox branding, no auto-settlement.
 * Transfers are accepted as "submitted" / "pending_approval" for staff to process offline.
 * Replace with a live payment adapter when you connect a real provider.
 */
class ManualCoreAdapter {
  constructor({ logger } = {}) {
    this.logger = logger;
    this.code = PROVIDER_MANUAL;
    // Optional in-memory balances for display (not a payment rail)
    this._balances = new Map();
  }

  _key(accountRef, currency) {
    return `${String(accountRef)}:${String(currency || 'NGN').toUpperCase()}`;
  }

  _ensureAccount(accountRef, currency) {
    const key = this._key(accountRef, currency);
    if (!this._balances.has(key)) {
      const opening = process.env.MANUAL_OPENING_BALANCE || '0.00';
      this._balances.set(key, {
        available: String(opening),
        ledger: String(opening),
        currency: (currency || 'NGN').toUpperCase()
      });
    }
    return key;
  }

  async getBalance({ externalAccountRef, currency }) {
    const key = this._ensureAccount(externalAccountRef, currency);
    const bal = this._balances.get(key);
    return {
      accountRef: String(externalAccountRef),
      currency: bal.currency,
      available: bal.available,
      ledger: bal.ledger,
      asOf: new Date().toISOString(),
      isDemo: false,
      provider: this.code
    };
  }

  async validateBeneficiary({ accountNumber, currency }) {
    if (!accountNumber || String(accountNumber).length < 4) {
      return { valid: false, reason: 'invalid_beneficiary' };
    }
    const digits = String(accountNumber).replace(/\s+/g, '');
    const mask =
      digits.length > 4
        ? `${'*'.repeat(Math.min(digits.length - 4, 6))}${digits.slice(-4)}`
        : digits;
    return {
      valid: true,
      maskedName: `Account ${mask}`,
      currency: currency || 'NGN'
    };
  }

  async initiateTransfer({
    idempotencyKey,
    sourceExternalRef,
    sourceCurrency,
    amount,
    destinationAccountRef,
    destinationCurrency,
    narrative
  }) {
    const amt = Number(amount);
    if (!(amt > 0) || Number.isNaN(amt)) {
      return {
        status: 'failed',
        providerReference: null,
        failureCode: 'invalid_amount',
        isDemo: false
      };
    }

    // Manual mode: accept the instruction; ops process offline
    const providerReference = `GTB-M-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    this.logger?.info(
      {
        providerReference,
        idempotencyKey,
        amount: amt,
        sourceCurrency,
        destinationAccountRef,
        narrative
      },
      'Manual transfer submitted for processing'
    );

    return {
      status: 'submitted',
      providerReference,
      failureCode: null,
      isDemo: false,
      amount: amt.toFixed(2),
      sourceCurrency,
      destinationCurrency: destinationCurrency || sourceCurrency,
      destinationAccountRef,
      narrative: narrative || null,
      completedAt: null,
      idempotentReplay: false
    };
  }

  async getTransferStatus(providerReference) {
    // Manual rails do not auto-update; stay submitted until ops/API marks complete
    return {
      status: 'submitted',
      providerReference,
      isDemo: false
    };
  }

  async verifyWebhookSignature() {
    return false;
  }
}

module.exports = { ManualCoreAdapter };