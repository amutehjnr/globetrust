'use strict';

const crypto = require('node:crypto');

/**
 * Application-level AES-256-GCM for MFA secrets at rest.
 * Production: load MFA_ENCRYPTION_KEY from a secrets manager (32-byte hex or base64).
 */
function getKey() {
  const raw = process.env.MFA_ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MFA_ENCRYPTION_KEY is required in production');
    }
    // Dev-only deterministic key from SESSION_SECRET (not ideal — set MFA_ENCRYPTION_KEY)
    return crypto.createHash('sha256').update(process.env.SESSION_SECRET || 'dev-only').digest();
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  return crypto.createHash('sha256').update(raw).digest();
}

function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
}

function decrypt(blob) {
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
