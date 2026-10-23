'use strict';

const argon2 = require('argon2');

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1
};

async function hashPassword(plain) {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

async function verifyPassword(hash, plain) {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

module.exports = { hashPassword, verifyPassword };
