'use strict';

const crypto = require('node:crypto');

/**
 * Minimal TOTP (RFC 6238) — HMAC-SHA1, 30s step, 6 digits, base32 secret.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  const bytes = Buffer.from(buf);
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
}

function base32Decode(input) {
  const str = String(input || '')
    .toUpperCase()
    .replace(/=+$/g, '')
    .replace(/[\s-]+/g, '');
  let bits = '';
  for (const c of str) {
    const val = BASE32_ALPHABET.indexOf(c);
    if (val < 0) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/** 20-byte secret → base32 (compatible with Google/Microsoft Authenticator). */
function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secretBuf, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secretBuf).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1e6).padStart(6, '0');
}

function generateTotp(secretBase32, at = Date.now(), step = 30) {
  const secretBuf = base32Decode(secretBase32);
  const counter = Math.floor(at / 1000 / step);
  return hotp(secretBuf, counter);
}

function verifyTotp(token, secretBase32, opts = {}) {
  const window = opts.window != null ? Number(opts.window) : 3;
  const step = opts.step != null ? Number(opts.step) : 30;
  const cleaned = String(token || '').replace(/\D/g, '').padStart(6, '0').slice(-6);
  if (!/^\d{6}$/.test(cleaned)) return false;
  const secretBuf = base32Decode(secretBase32);
  if (!secretBuf.length) return false;
  const counter = Math.floor(Date.now() / 1000 / step);
  for (let w = -window; w <= window; w++) {
    if (hotp(secretBuf, counter + w) === cleaned) return true;
  }
  return false;
}

function otpauthUrl({ accountName, issuer, secret }) {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const q = new URLSearchParams({
    secret: String(secret).replace(/\s+/g, ''),
    issuer: String(issuer),
    algorithm: 'SHA1',
    digits: '6',
    period: '30'
  });
  return `otpauth://totp/${label}?${q.toString()}`;
}

module.exports = {
  generateSecret,
  generateTotp,
  verifyTotp,
  base32Decode,
  base32Encode,
  otpauthUrl
};