'use strict';

const crypto = require('node:crypto');

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

function uuidToBinary(uuid) {
  if (!isUuid(uuid)) {
    const err = new Error('Invalid identifier');
    err.status = 400;
    err.code = 'INVALID_UUID';
    throw err;
  }
  const hex = uuid.replace(/-/g, '');
  return Buffer.from(hex, 'hex');
}

function binaryToUuid(buf) {
  if (!buf) return null;
  const hex = Buffer.from(buf).toString('hex');
  if (hex.length !== 32) return null;
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join('-');
}

function newUuid() {
  return crypto.randomUUID();
}

function newBinaryId() {
  return uuidToBinary(newUuid());
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

module.exports = {
  isUuid,
  uuidToBinary,
  binaryToUuid,
  newUuid,
  newBinaryId,
  sha256Hex,
  randomToken
};
