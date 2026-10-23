'use strict';

const crypto = require('node:crypto');
const { PROVIDER_SANDBOX } = require('./types');

/**
 * Sandbox / mock core-banking adapter for development only.
 * Does not move real money. Does not call real bank endpoints.
 * Replace with a bank-approved adapter using official API contracts.
 */
class SandboxCoreAdapter {
  constructor({ logger } = {}) {
    this.code = PROVIDER_SANDBOX;
    this.logger = logger;
    // In-memory demo ledger keyed by external account ref (process-local)
    this._balances = new Map();
    this._transfers = new Map();
  }

  _ensureAccount(externalRef, currency) {
    const key = `${externalRef}:${currency}`;
    if (!this._balances.has(key)) {
      // Fixed demo starting balance — clearly not real funds
      this._balances.set(key, {
        available: '10000.00',
        ledger: '10000.00',
        currency
      });
    }
    return key;
  }

  async getBalance({ externalAccountRef, currency }) {
    const key = this._ensureAccount(externalAccountRef, currency);
    const bal = this._balances.get(key);
    return {
      accountRef: externalAccountRef,
      currency,
      available: bal.available,
      ledger: bal.ledger,
      asOf: new Date().toISOString(),
      isDemo: true,
      provider: this.code
    };
  }

  async validateBeneficiary({ accountNumber, currency }) {
    // Sandbox accepts any non-empty reference
    if (!accountNumber || String(accountNumber).length < 4) {
      return { valid: false, reason: 'invalid_beneficiary' };
    }
    return {
      valid: true,
      maskedName: 'SANDBOX BENEFICIARY',
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
    const existing = this._transfers.get(idempotencyKey);
    if (existing) {
      return { ...existing, idempotentReplay: true };
    }

    const key = this._ensureAccount(sourceExternalRef, sourceCurrency);
    const bal = this._balances.get(key);
    const amt = Number(amount);
    if (!(amt > 0) || Number.isNaN(amt)) {
      return {
        status: 'failed',
        providerReference: null,
        failureCode: 'invalid_amount',
        isDemo: true
      };
    }
    if (Number(bal.available) < amt) {
      return {
        status: 'failed',
        providerReference: null,
        failureCode: 'insufficient_funds',
        isDemo: true
      };
    }

    const providerReference = `SBX-${crypto.randomBytes(8).toString('hex')}`;
    // Debit demo balance
    const next = (Number(bal.available) - amt).toFixed(2);
    this._balances.set(key, { available: next, ledger: next, currency: sourceCurrency });

    const record = {
      status: 'succeeded',
      providerReference,
      failureCode: null,
      isDemo: true,
      amount: amt.toFixed(2),
      sourceCurrency,
      destinationCurrency: destinationCurrency || sourceCurrency,
      destinationAccountRef,
      narrative: narrative || null,
      completedAt: new Date().toISOString()
    };
    this._transfers.set(idempotencyKey, record);
    this.logger?.info({ providerReference, isDemo: true }, 'Sandbox transfer recorded');
    return { ...record, idempotentReplay: false };
  }

  async getTransferStatus(providerReference) {
    for (const rec of this._transfers.values()) {
      if (rec.providerReference === providerReference) {
        return {
          status: rec.status,
          providerReference,
          isDemo: true
        };
      }
    }
    return { status: 'unknown', providerReference, isDemo: true };
  }

  /**
   * Verify webhook signature — sandbox uses HMAC-SHA256 of raw body with shared secret.
   */
  verifyWebhookSignature(rawBody, signatureHeader, secret) {
    if (!secret || !signatureHeader) return false;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(String(signatureHeader))
      );
    } catch {
      return false;
    }
  }
}

module.exports = { SandboxCoreAdapter };
