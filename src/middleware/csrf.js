'use strict';

const crypto = require('node:crypto');

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

function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
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
      expectedLen: expected ? String(expected).length : 0,
      tokenStart: token ? String(token).slice(0, 8) : null,
      expectedStart: expected ? String(expected).slice(0, 8) : null,
      sessionId: req.sessionID || null,
      hasPendingMfa: Boolean(req.session?.pendingMfaUser),
      hasUser: Boolean(req.session?.user)
    }));

    const err = new Error('Invalid or missing CSRF token.');
    err.status = 403;
    err.code = 'EBADCSRFTOKEN';
    return next(err);
  }
  next();
}

module.exports = { ensureCsrfToken, localsCsrf, requireCsrf };