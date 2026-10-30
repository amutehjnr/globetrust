'use strict';

const QRCode = require('qrcode');
const { encrypt, decrypt } = require('../utils/cryptoBox');
const crypto = require('node:crypto');
const {
  generateSecret,
  verifyTotp,
  otpauthUrl
} = require('../utils/totp');
const { uuidToBinary } = require('../utils/ids');

function packEnrolToken(secret) {
  return encrypt(String(secret)).toString('base64url');
}

function unpackEnrolToken(token) {
  if (!token) return null;
  try {
    const buf = Buffer.from(String(token), 'base64url');
    return String(decrypt(buf)).trim().replace(/\s+/g, '');
  } catch (_) {
    try {
      const buf = Buffer.from(String(token), 'base64');
      return String(decrypt(buf)).trim().replace(/\s+/g, '');
    } catch (e) {
      return null;
    }
  }
}

function normalizeToken(code) {

  return String(code || '').replace(/\D/g, '').padStart(6, '0').slice(-6);
}

function createMfaService({ pool, logger }) {
  const issuer = process.env.MFA_ISSUER || 'Globe Trust Bank';

  async function loadSecretRow(userId) {
    const [rows] = await pool.query(
      `SELECT secret_encrypted, enabled_at FROM mfa_totp_secrets WHERE user_id = ? LIMIT 1`,
      [uuidToBinary(userId)]
    );
    return rows[0] || null;
  }

  function decryptSecret(blob) {
    if (blob == null) throw new Error('missing_secret');
    const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
    return String(decrypt(buf)).trim().replace(/\s+/g, '');
  }

  function checkCode(token, secret) {
    return verifyTotp(token, secret, { window: 3, step: 30 });
  }

  return {
    async getStatus(userId) {
      const row = await loadSecretRow(userId);
      const [userRows] = await pool.query(
        `SELECT mfa_required, mfa_enrolled_at FROM users WHERE id = ? LIMIT 1`,
        [uuidToBinary(userId)]
      );
      const u = userRows[0];
      return {
        enrolled: Boolean(row && row.enabled_at),
        required: Boolean(u && u.mfa_required),
        enrolledAt: (u && u.mfa_enrolled_at) || null
      };
    },

    async beginEnrolment(userId, email, { rotate = true } = {}) {
      const existing = await loadSecretRow(userId);
      let secret;
      if (existing && !existing.enabled_at && !rotate) {
        try {
          secret = decryptSecret(existing.secret_encrypted);
        } catch (err) {
          logger.warn({ err }, 'Pending MFA secret decrypt failed; rotating');
          secret = null;
        }
      }
      if (!secret) {
        secret = generateSecret();
        const encrypted = encrypt(secret);
        await pool.query(
          `INSERT INTO mfa_totp_secrets (user_id, secret_encrypted, enabled_at)
           VALUES (?, ?, NULL)
           ON DUPLICATE KEY UPDATE secret_encrypted = VALUES(secret_encrypted), enabled_at = NULL`,
          [uuidToBinary(userId), encrypted]
        );
      }

      const otpauth = otpauthUrl({
        accountName: email || userId,
        issuer,
        secret
      });
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
      return { secret, otpauth, qrDataUrl, enrolToken: packEnrolToken(secret) };
    },

    /**
     * @param {string} userId
     * @param {string} code
     * @param {{ pendingSecret?: string }} [opts] session secret shown on QR (preferred)
     */
    async confirmEnrolment(userId, code, opts = {}) {
      const row = await loadSecretRow(userId);
      if (!row) {
        const err = new Error('Start MFA enrolment first.');
        err.status = 400;
        throw err;
      }
      if (row.enabled_at) {
        const err = new Error('MFA is already enabled on this account.');
        err.status = 400;
        throw err;
      }

      let secret = null;
      if (opts.enrolToken) {
        secret = unpackEnrolToken(opts.enrolToken);
      }
      if (!secret && opts.pendingSecret) {
        secret = String(opts.pendingSecret).trim().replace(/\s+/g, '');
      }
      if (!secret) {

        try {
          secret = decryptSecret(row.secret_encrypted);
        } catch (decErr) {
          logger.error({ err: decErr, userId }, 'MFA secret decrypt failed');
          const err = new Error('Authenticator cannot be verified. Contact support.');
          err.status = 500;
          throw err;
        }
      }

      const token = normalizeToken(code);
      if (!checkCode(token, secret)) {
        console.error(
          '[GLOBE_MFA] invalid enrol code',
          JSON.stringify({ userId, tokenLen: token.length, secretLen: secret.length })
        );
        const err = new Error(
          'Invalid authentication code. Use the newest code from the app for this QR, and check phone time is automatic.'
        );
        err.status = 400;
        throw err;
      }

      // Ensure DB secret matches the verified one (session path)
      const encrypted = encrypt(secret);
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query(
          `UPDATE mfa_totp_secrets
           SET secret_encrypted = ?, enabled_at = UTC_TIMESTAMP(6)
           WHERE user_id = ?`,
          [encrypted, uuidToBinary(userId)]
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
      const row = await loadSecretRow(userId);
      if (!(row && row.enabled_at)) {
        const err = new Error('MFA is not enabled for this account.');
        err.status = 400;
        throw err;
      }
      let secret;
      try {
        secret = decryptSecret(row.secret_encrypted);
      } catch (decErr) {
        logger.error({ err: decErr, userId }, 'MFA secret decrypt failed — check MFA_ENCRYPTION_KEY');
        const err = new Error(
          'Authenticator cannot be verified. Contact support or re-enrol MFA.'
        );
        err.status = 500;
        throw err;
      }
      const token = normalizeToken(code);
      if (!checkCode(token, secret)) {
        console.error(
          '[GLOBE_MFA] invalid login code',
          JSON.stringify({ userId, tokenLen: token.length, secretLen: secret.length })
        );
        const err = new Error(
          'Invalid authentication code. Check your authenticator app time and try a fresh code.'
        );
        err.status = 401;
        throw err;
      }
      return { ok: true };
    }
  };
}

module.exports = { createMfaService };