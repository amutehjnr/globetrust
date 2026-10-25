'use strict';

const crypto = require('node:crypto');

/**
 * Double-submit CSRF token in session + form field / header.
 * Not a substitute for SameSite cookies; works with them.
 */
function ensureCsrfToken(req, _res, next) {
  if (!req.session) return next();
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('base64url');
  }
  next();
}

function localsCsrf(req, res, next) {
  res.locals.csrfToken = req.session?.csrfToken || '';
  next();
}

function requireCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const token =
    req.body?._csrf ||
    req.get('x-csrf-token') ||
    req.get('csrf-token');
  const expected = req.session?.csrfToken;
  if (!expected || !token || !timingSafeEqualStr(token, expected)) {
    console.error('[GLOBE_CSRF] rejected', JSON.stringify({
      method: req.method,
      url: req.originalUrl || req.url,
      hasSession: Boolean(req.session),
      hasExpected: Boolean(expected),
      hasToken: Boolean(token),
      tokenLen: token ? String(token).length : 0,
      expectedLen: expected ? String(expected).length : 0
    }));
    const err = new Error('Invalid or missing CSRF token.');
    err.status = 403;
    return next(err);
  }
  next();
}

function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

module.exports = { ensureCsrfToken, localsCsrf, requireCsrf };