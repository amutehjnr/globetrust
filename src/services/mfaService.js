'use strict';

const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const { encrypt, decrypt } = require('../utils/cryptoBox');
const { uuidToBinary, binaryToUuid } = require('../utils/ids');

authenticator.options = { window: 2, step: 30 }; // ±60s clock skew (server/device)

function createMfaService({ pool, logger }) {
  const issuer = process.env.MFA_ISSUER || 'Globe Trust Bank';

  return {
    async getStatus(userId) {
      const [rows] = await pool.query(
        `SELECT enabled_at FROM mfa_totp_secrets WHERE user_id = ? LIMIT 1`,
        [uuidToBinary(userId)]
      );
      const [userRows] = await pool.query(
        `SELECT mfa_required, mfa_enrolled_at FROM users WHERE id = ? LIMIT 1`,
        [uuidToBinary(userId)]
      );
      const u = userRows[0];
      return {
        enrolled: Boolean(rows[0]?.enabled_at),
        required: Boolean(u?.mfa_required),
        enrolledAt: u?.mfa_enrolled_at || null
      };
    },

    async beginEnrolment(userId, email, { rotate = true } = {}) {
      const [existing] = await pool.query(
        `SELECT secret_encrypted, enabled_at FROM mfa_totp_secrets WHERE user_id = ? LIMIT 1`,
        [uuidToBinary(userId)]
      );
      let secret;
      if (existing[0] && !existing[0].enabled_at && !rotate) {
        secret = decrypt(existing[0].secret_encrypted);
      } else {
        secret = authenticator.generateSecret();
        const encrypted = encrypt(secret);
        await pool.query(
          `INSERT INTO mfa_totp_secrets (user_id, secret_encrypted, enabled_at)
           VALUES (?, ?, NULL)
           ON DUPLICATE KEY UPDATE secret_encrypted = VALUES(secret_encrypted), enabled_at = NULL`,
          [uuidToBinary(userId), encrypted]
        );
      }
      const otpauth = authenticator.keyuri(email, issuer, secret);
      let qrDataUrl = null;
      try {
        qrDataUrl = await QRCode.toDataURL(otpauth, {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 220
        });
      } catch (err) {
        logger.warn({ err }, 'QR generation failed; manual secret only');
      }
      return { secret, otpauth, qrDataUrl };
    },

    async confirmEnrolment(userId, code) {
      const [rows] = await pool.query(
        `SELECT secret_encrypted, enabled_at FROM mfa_totp_secrets WHERE user_id = ? LIMIT 1`,
        [uuidToBinary(userId)]
      );
      if (!rows[0]) {
        const err = new Error('Start MFA enrolment first.');
        err.status = 400;
        throw err;
      }
      if (rows[0].enabled_at) {
        const err = new Error('MFA is already enabled on this account.');
        err.status = 400;
        throw err;
      }
      let secret;
      try {
        secret = decrypt(rows[0].secret_encrypted);
      } catch (decErr) {
        logger.error({ err: decErr, userId }, 'MFA secret decrypt failed — check MFA_ENCRYPTION_KEY');
        const err = new Error('Authenticator cannot be verified. Contact support or re-enrol MFA.');
        err.status = 500;
        throw err;
      }
      const token = String(code || '').replace(/\D/g, '').padStart(6, '0').slice(-6);
      // Wider tolerance: try explicit window
      let valid = false;
      try {
        valid = authenticator.verify({ token, secret, window: 2 });
      } catch (_) {
        valid = false;
      }
      if (!valid && typeof authenticator.check === 'function') {
        try {
          valid = authenticator.check(token, secret);
        } catch (_) {
          valid = false;
        }
      }
      if (!valid) {
        console.error('[GLOBE_MFA] invalid code', JSON.stringify({ userId, tokenLen: token.length }));
        const err = new Error('Invalid authentication code. Check the time on your device and try again.');
        err.status = 400;
        throw err;
      }
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query(
          `UPDATE mfa_totp_secrets SET enabled_at = UTC_TIMESTAMP(6) WHERE user_id = ?`,
          [uuidToBinary(userId)]
        );
        await conn.query(
          `UPDATE users SET mfa_enrolled_at = UTC_TIMESTAMP(6) WHERE id = ?`,
          [uuidToBinary(userId)]
        );
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
      logger.info({ userId }, 'MFA TOTP enrolled');
      return { ok: true };
    },

    async verifyLoginCode(userId, code) {
      const [rows] = await pool.query(
        `SELECT secret_encrypted, enabled_at FROM mfa_totp_secrets WHERE user_id = ? LIMIT 1`,
        [uuidToBinary(userId)]
      );
      if (!rows[0]?.enabled_at) {
        const err = new Error('MFA is not enabled for this account.');
        err.status = 400;
        throw err;
      }
      let secret;
      try {
        secret = decrypt(rows[0].secret_encrypted);
      } catch (decErr) {
        logger.error({ err: decErr, userId }, 'MFA secret decrypt failed — check MFA_ENCRYPTION_KEY');
        const err = new Error('Authenticator cannot be verified. Contact support or re-enrol MFA.');
        err.status = 500;
        throw err;
      }
      const token = String(code || '').replace(/\D/g, '').padStart(6, '0').slice(-6);
      let valid = false;
      try {
        valid = authenticator.verify({ token, secret, window: 2 });
      } catch (_) {
        valid = false;
      }
      if (!valid && typeof authenticator.check === 'function') {
        try {
          valid = authenticator.check(token, secret);
        } catch (_) {
          valid = false;
        }
      }
      if (!valid) {
        console.error('[GLOBE_MFA] invalid login code', JSON.stringify({ userId, tokenLen: token.length }));
        const err = new Error('Invalid authentication code. Check your authenticator app time and try a fresh code.');
        err.status = 401;
        throw err;
      }
      return { ok: true };
    }
  };
}

module.exports = { createMfaService };