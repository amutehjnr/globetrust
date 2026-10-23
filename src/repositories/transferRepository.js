'use strict';

const crypto = require('node:crypto');
const { newBinaryId, uuidToBinary, binaryToUuid } = require('../utils/ids');

function hashIdempotencyKey(key) {
  return crypto.createHash('sha256').update(String(key)).digest();
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
        displayLabel: r.display_label,
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
      return rows.map((r) => ({
        id: binaryToUuid(r.id),
        providerCode: r.provider_code,
        externalReference: r.external_reference,
        sourceCurrency: r.source_currency,
        sourceAmount: r.source_amount,
        destinationCurrency: r.destination_currency,
        status: r.status,
        failureCode: r.failure_code,
        createdAt: r.created_at,
        completedAt: r.completed_at
      }));
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
        displayLabel: rows[0].display_label,
        linkStatus: rows[0].link_status
      };
    },

    async ensureSandboxLink(userId, currency = 'NGN') {
      const [existing] = await pool.query(
        `SELECT id FROM bank_account_links
         WHERE user_id = ? AND provider_code = 'sandbox_core' AND currency_code = ? AND unlinked_at IS NULL
         LIMIT 1`,
        [uuidToBinary(userId), currency]
      );
      if (existing[0]) return binaryToUuid(existing[0].id);

      const id = newBinaryId();
      const ref = Buffer.from(`sandbox-${userId.slice(0, 8)}-${currency}`, 'utf8');
      await pool.query(
        `INSERT INTO bank_account_links
          (id, user_id, provider_code, external_account_ref, currency_code, display_label, account_type, link_status)
         VALUES (?, ?, 'sandbox_core', ?, ?, ?, 'current', 'active')`,
        [id, uuidToBinary(userId), ref, currency, `Sandbox ${currency} current`]
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
    }
  };
}

module.exports = { createTransferRepository };
