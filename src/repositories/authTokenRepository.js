'use strict';

const { newBinaryId, uuidToBinary, sha256Hex } = require('../utils/ids');

function createAuthTokenRepository(pool) {
  return {
    async createPasswordReset(userId, rawToken, expiresAt, ip) {
      const id = newBinaryId();
      await pool.query(
        `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, request_ip)
         VALUES (?, ?, ?, ?, ?)`,
        [id, uuidToBinary(userId), sha256Hex(rawToken), expiresAt, ip || null]
      );
    },

    async consumePasswordReset(rawToken) {
      const hash = sha256Hex(rawToken);
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [rows] = await conn.query(
          `SELECT id, user_id, expires_at, used_at
           FROM password_reset_tokens
           WHERE token_hash = ?
           LIMIT 1
           FOR UPDATE`,
          [hash]
        );
        const row = rows[0];
        if (!row || row.used_at || new Date(row.expires_at) < new Date()) {
          await conn.rollback();
          return null;
        }
        await conn.query(
          `UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP(6) WHERE id = ?`,
          [row.id]
        );
        await conn.commit();
        const { binaryToUuid } = require('../utils/ids');
        return binaryToUuid(row.user_id);
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    },

    async logLoginEvent({ userId, emailAttempt, success, failureReason, ip, userAgent }) {
      await pool.query(
        `INSERT INTO login_events (user_id, email_attempt, success, failure_reason, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userId ? uuidToBinary(userId) : null,
          emailAttempt || null,
          success ? 1 : 0,
          failureReason || null,
          ip || null,
          userAgent ? String(userAgent).slice(0, 255) : null
        ]
      );
    }
  };
}

module.exports = { createAuthTokenRepository };
