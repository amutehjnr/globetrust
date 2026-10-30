'use strict';

const { COUNTRY_CURRENCY, symbolForCurrency } = require('../utils/currency');

const crypto = require('node:crypto');
const { newBinaryId, uuidToBinary, binaryToUuid } = require('../utils/ids');

function hashIdempotencyKey(key) {
  return crypto.createHash('sha256').update(String(key)).digest();
}

function normalizeDisplayLabel(label, currencyCode) {
  const cur = currencyCode || '';
  if (!label || /sandbox/i.test(String(label))) {
    return `Globe Trust ${cur} Current`.trim();
  }
  return label;
}

function createTransferRepository(pool) {
  return {
    hashIdempotencyKey,

    async findByIdempotency(userId, idempotencyKey) {
      const [rows] = await pool.query(
        `SELECT id, status, external_reference, source_amount, source_currency, failure_code, created_at
         FROM transaction_requests
         WHERE user_id = ? AND idempotency_key_hash = ?
         LIMIT 1`,
        [uuidToBinary(userId), hashIdempotencyKey(idempotencyKey)]
      );
      if (!rows[0]) return null;
      const r = rows[0];
      return {
        id: binaryToUuid(r.id),
        status: r.status,
        externalReference: r.external_reference,
        sourceAmount: r.source_amount,
        sourceCurrency: r.source_currency,
        failureCode: r.failure_code,
        createdAt: r.created_at
      };
    },

    async createRequest(row) {
      const id = newBinaryId();
      await pool.query(
        `INSERT INTO transaction_requests (
          id, user_id, provider_code, external_reference, idempotency_key_hash,
          transaction_type, source_account_link_id, destination_account_ref_ciphertext,
          source_currency, destination_currency, source_amount, destination_amount,
          status, failure_code
        ) VALUES (?, ?, ?, ?, ?, 'transfer', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          uuidToBinary(row.userId),
          row.providerCode,
          row.externalReference || null,
          hashIdempotencyKey(row.idempotencyKey),
          row.sourceAccountLinkId ? uuidToBinary(row.sourceAccountLinkId) : null,
          row.destinationCiphertext || null,
          row.sourceCurrency,
          row.destinationCurrency || null,
          row.sourceAmount,
          row.destinationAmount || null,
          row.status,
          row.failureCode || null
        ]
      );
      return binaryToUuid(id);
    },

    async updateStatus(id, { status, externalReference, failureCode, completed }) {
      await pool.query(
        `UPDATE transaction_requests
         SET status = ?,
             external_reference = COALESCE(?, external_reference),
             failure_code = ?,
             completed_at = IF(?, UTC_TIMESTAMP(6), completed_at)
         WHERE id = ?`,
        [
          status,
          externalReference || null,
          failureCode || null,
          completed ? 1 : 0,
          uuidToBinary(id)
        ]
      );
    },

    async addEvent(requestId, eventType, safeMetadata) {
      await pool.query(
        `INSERT INTO transaction_events (transaction_request_id, event_type, safe_metadata)
         VALUES (?, ?, ?)`,
        [uuidToBinary(requestId), eventType, JSON.stringify(safeMetadata || {})]
      );
    },


    async listLinksWithExternal(userId) {
      const [rows] = await pool.query(
        `SELECT id, provider_code, external_account_ref, currency_code, display_label, account_type, link_status, linked_at
         FROM bank_account_links
         WHERE user_id = ? AND unlinked_at IS NULL
         ORDER BY currency_code`,
        [uuidToBinary(userId)]
      );
      return rows.map((r) => ({
        id: binaryToUuid(r.id),
        providerCode: r.provider_code,
        externalAccountRef: Buffer.from(r.external_account_ref).toString('utf8'),
        currencyCode: r.currency_code,
        displayLabel: normalizeDisplayLabel(r.display_label, r.currency_code),
        accountType: r.account_type,
        linkStatus: r.link_status,
        linkedAt: r.linked_at
      }));
    },

    async listForUser(userId, limit = 50) {
      const [rows] = await pool.query(
        `SELECT id, provider_code, external_reference, source_currency, source_amount,
                destination_currency, status, failure_code, created_at, completed_at
         FROM transaction_requests
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
        [uuidToBinary(userId), limit]
      );
      return rows.map((r) => {
        let ref = r.external_reference || '';
        // Hide legacy sandbox-looking prefixes in the UI
        if (typeof ref === 'string') {
          ref = ref.replace(/^SBX-/i, 'GTB-');
        }
        const destinationLabel = ref
          ? `Transfer · ${ref}`
          : 'Transfer';
        return {
          id: binaryToUuid(r.id),
          providerCode: ['sandbox_core', 'globe_trust_manual'].includes(r.provider_code) ? 'globe_trust' : r.provider_code,
          externalReference: ref,
          reference: ref,
          destinationLabel,
          sourceCurrency: r.source_currency,
          sourceAmount: r.source_amount,
          destinationCurrency: r.destination_currency,
          status: r.status,
          failureCode: r.failure_code,
          createdAt: r.created_at,
          completedAt: r.completed_at
        };
      });
    },

    async getOwned(userId, requestId) {
      const [rows] = await pool.query(
        `SELECT id, status, external_reference, provider_code, source_amount, source_currency, failure_code
         FROM transaction_requests
         WHERE id = ? AND user_id = ?
         LIMIT 1`,
        [uuidToBinary(requestId), uuidToBinary(userId)]
      );
      if (!rows[0]) return null;
      const r = rows[0];
      return {
        id: binaryToUuid(r.id),
        status: r.status,
        externalReference: r.external_reference,
        providerCode: r.provider_code,
        sourceAmount: r.source_amount,
        sourceCurrency: r.source_currency,
        failureCode: r.failure_code
      };
    },

    async getAccountLinkOwned(userId, linkId) {
      const [rows] = await pool.query(
        `SELECT id, provider_code, external_account_ref, currency_code, display_label, link_status
         FROM bank_account_links
         WHERE id = ? AND user_id = ? AND unlinked_at IS NULL
         LIMIT 1`,
        [uuidToBinary(linkId), uuidToBinary(userId)]
      );
      if (!rows[0]) return null;
      return {
        id: binaryToUuid(rows[0].id),
        providerCode: rows[0].provider_code,
        externalAccountRef: rows[0].external_account_ref.toString('utf8'),
        currencyCode: rows[0].currency_code,
        displayLabel: normalizeDisplayLabel(rows[0].display_label, rows[0].currency_code),
        linkStatus: rows[0].link_status
      };
    },

    
    async ensureCurrency(code) {
      const cur = String(code || 'USD').toUpperCase().slice(0, 3);
      if (!/^[A-Z]{3}$/.test(cur)) {
        const err = new Error('Invalid currency code.');
        err.status = 400;
        throw err;
      }
      // Prefer known display name from country map
      let name = cur;
      try {
        const hit = Object.values(COUNTRY_CURRENCY || {}).find((c) => c.code === cur);
        if (hit && hit.name) name = hit.name;
      } catch (_) {}
      const known = {
        NGN: 'Nigerian Naira',
        USD: 'United States Dollar',
        GBP: 'Pound Sterling',
        EUR: 'Euro',
        CAD: 'Canadian Dollar',
        AUD: 'Australian Dollar',
        GHS: 'Ghanaian Cedi',
        KES: 'Kenyan Shilling',
        ZAR: 'South African Rand',
        INR: 'Indian Rupee',
        JPY: 'Japanese Yen',
        CNY: 'Chinese Yuan',
        CHF: 'Swiss Franc',
        AED: 'UAE Dirham',
        SAR: 'Saudi Riyal',
        XOF: 'West African CFA Franc',
        XAF: 'Central African CFA Franc'
      };
      if (known[cur]) name = known[cur];
      await pool.query(
        `INSERT IGNORE INTO currencies (code, name, minor_units, is_enabled)
         VALUES (?, ?, 2, TRUE)`,
        [cur, name]
      );
      return cur;
    },

    async ensureSandboxLink(userId, currency = 'NGN') {
      currency = await this.ensureCurrency(currency);
      // Always strip sandbox wording from account labels for this user
      await pool.query(
        `UPDATE bank_account_links
         SET display_label = CONCAT('Globe Trust ', currency_code, ' Current')
         WHERE user_id = ?
           AND unlinked_at IS NULL
           AND (
             display_label LIKE '%[Ss]andbox%'
             OR display_label LIKE 'Sandbox %'
             OR display_label LIKE '%sandbox%'
             OR display_label IS NULL
             OR display_label = ''
           )`,
        [uuidToBinary(userId)]
      );

      const provider =
        (process.env.CORE_BANKING_MODE || 'manual').toLowerCase() === 'sandbox'
          ? 'sandbox_core'
          : 'globe_trust';

      const [existing] = await pool.query(
        `SELECT id FROM bank_account_links
         WHERE user_id = ? AND currency_code = ? AND unlinked_at IS NULL
           AND provider_code IN ('sandbox_core', 'globe_trust', 'globe_trust_manual')
         LIMIT 1`,
        [uuidToBinary(userId), currency]
      );
      if (existing[0]) {
        // Promote legacy sandbox provider label
        await pool.query(
          `UPDATE bank_account_links
           SET provider_code = ?, display_label = CONCAT('Globe Trust ', currency_code, ' Current')
           WHERE id = ?`,
          [provider, existing[0].id]
        );
        return binaryToUuid(existing[0].id);
      }

      const id = newBinaryId();
      const ref = Buffer.from(`gtb-${userId.slice(0, 8)}-${currency}`, 'utf8');
      await pool.query(
        `INSERT INTO bank_account_links
          (id, user_id, provider_code, external_account_ref, currency_code, display_label, account_type, link_status)
         VALUES (?, ?, ?, ?, ?, ?, 'current', 'active')`,
        [id, uuidToBinary(userId), provider, ref, currency, `Globe Trust ${currency} Current`]
      );
      return binaryToUuid(id);
    },

    async recordWebhook({ providerCode, eventId, payloadHash, signatureValid }) {
      const id = newBinaryId();
      try {
        await pool.query(
          `INSERT INTO webhook_events (id, provider_code, event_id, payload_hash, signature_valid)
           VALUES (?, ?, ?, ?, ?)`,
          [id, providerCode, eventId, payloadHash, signatureValid ? 1 : 0]
        );
        return { id: binaryToUuid(id), duplicate: false };
      } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') {
          return { id: null, duplicate: true };
        }
        throw err;
      }
    },

    async markWebhookProcessed(providerCode, eventId, status) {
      await pool.query(
        `UPDATE webhook_events
         SET processed_at = UTC_TIMESTAMP(6), processing_status = ?
         WHERE provider_code = ? AND event_id = ?`,
        [status, providerCode, eventId]
      );
    },

    async getManualBalance(userId, currencyCode) {
      try {
        const [rows] = await pool.query(
          `SELECT available, ledger, currency_code FROM manual_balances
           WHERE user_id = ? AND currency_code = ? LIMIT 1`,
          [uuidToBinary(userId), String(currencyCode || 'USD').toUpperCase()]
        );
        if (!rows[0]) return null;
        return {
          available: String(rows[0].available),
          ledger: String(rows[0].ledger),
          currency: rows[0].currency_code
        };
      } catch (err) {
        if (err && err.code === 'ER_NO_SUCH_TABLE') return null;
        throw err;
      }
    },

    async listManualBalances(userId) {
      try {
        const [rows] = await pool.query(
          `SELECT currency_code, available, ledger, updated_at
           FROM manual_balances WHERE user_id = ? ORDER BY currency_code`,
          [uuidToBinary(userId)]
        );
        return rows.map((r) => ({
          currencyCode: r.currency_code,
          available: Number(r.available),
          ledger: Number(r.ledger),
          updatedAt: r.updated_at
        }));
      } catch (err) {
        if (err && err.code === 'ER_NO_SUCH_TABLE') return [];
        throw err;
      }
    },

    /** Credit (positive) or debit (negative) amount. mode=set replaces balance. */
    async creditManualBalance(userId, currencyCode, amount, { mode = 'credit' } = {}) {
      const cur = String(currencyCode || 'USD').toUpperCase().slice(0, 3);
      const amt = Number(amount);
      if (Number.isNaN(amt)) {
        const err = new Error('Invalid amount.');
        err.status = 400;
        throw err;
      }
      const uid = uuidToBinary(userId);
      const [existing] = await pool.query(
        `SELECT available, ledger FROM manual_balances WHERE user_id = ? AND currency_code = ? LIMIT 1`,
        [uid, cur]
      );
      let nextAvail;
      let nextLedger;
      if (mode === 'set') {
        nextAvail = amt;
        nextLedger = amt;
      } else {
        const prev = existing[0] ? Number(existing[0].available) : 0;
        nextAvail = prev + amt;
        nextLedger = existing[0] ? Number(existing[0].ledger) + amt : amt;
      }
      if (nextAvail < 0) {
        const err = new Error('Balance cannot go negative.');
        err.status = 400;
        throw err;
      }
      if (existing[0]) {
        await pool.query(
          `UPDATE manual_balances SET available = ?, ledger = ? WHERE user_id = ? AND currency_code = ?`,
          [nextAvail.toFixed(2), nextLedger.toFixed(2), uid, cur]
        );
      } else {
        await pool.query(
          `INSERT INTO manual_balances (user_id, currency_code, available, ledger)
           VALUES (?, ?, ?, ?)`,
          [uid, cur, nextAvail.toFixed(2), nextLedger.toFixed(2)]
        );
      }
      return { currencyCode: cur, available: nextAvail, ledger: nextLedger };
    },

  };
}

module.exports = { createTransferRepository };