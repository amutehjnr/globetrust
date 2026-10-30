'use strict';

const express = require('express');
const crypto = require('node:crypto');
const { z } = require('zod');
const { requireCsrf } = require('../../middleware/csrf');
const { requireAuth } = require('../../middleware/authz');
const { loginLimiter } = require('../../middleware/rateLimit');

const codeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app')
});

function parseCode(body) {
  const raw = body && (body.code != null ? body.code : body.token);
  const digits = String(raw == null ? '' : raw).replace(/\D/g, '');
  const r = codeSchema.safeParse({ code: digits });
  if (!r.success) {
    const err = new Error(r.error.issues[0].message);
    err.status = 400;
    throw err;
  }
  return r.data.code;
}

async function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

async function freshCsrf(req) {
  req.session.csrfToken = crypto.randomBytes(32).toString('base64url');
  await saveSession(req);
  return req.session.csrfToken;
}

function createMfaRouter({ mfaService, customerRepo }) {
  const router = express.Router();

  // --- Enrolment ---
  router.get('/mfa/enrol', requireAuth, async (req, res, next) => {
    try {
      const status = await mfaService.getStatus(req.session.user.id);
      if (status.enrolled) {
        const roles = req.session.user?.roles || [];
        const staff = ['admin', 'kyc_reviewer', 'support_agent', 'operations', 'auditor'];
        return res.redirect(roles.some((r) => staff.includes(r)) ? '/admin' : '/dashboard');
      }
      const enrolment = await mfaService.beginEnrolment(
        req.session.user.id,
        req.session.user.email,
        { rotate: false }
      );
      req.session.mfaEnrolPending = true;
      req.session.mfaEnrolSecret = enrolment.secret;
      const csrfToken = await freshCsrf(req);

      res.render('auth/mfa-enrol', {
        title: 'Set up authenticator',
        path: '/mfa/enrol',
        error: null,
        secret: enrolment.secret,
        qrDataUrl: enrolment.qrDataUrl,
        enrolToken: enrolment.enrolToken,
        csrfToken
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/mfa/enrol', requireAuth, requireCsrf, loginLimiter, async (req, res, next) => {
    try {
      const code = parseCode(req.body);
      await mfaService.confirmEnrolment(req.session.user.id, code, {
        pendingSecret: req.session.mfaEnrolSecret || null,
        enrolToken: req.body.enrolToken || null
      });
      delete req.session.mustEnrollMfa;
      delete req.session.mfaEnrolPending;
      delete req.session.mfaEnrolSecret;
      return res.render('auth/mfa-done', {
        title: 'Authenticator enabled',
        path: '/mfa/enrol'
      });
    } catch (err) {
      if (err.status === 400) {
        try {
          const enrolment = await mfaService.beginEnrolment(
            req.session.user.id,
            req.session.user.email,
            { rotate: false }
          );
          req.session.mfaEnrolSecret = enrolment.secret;
          const csrfToken = await freshCsrf(req);
          return res.status(400).render('auth/mfa-enrol', {
            title: 'Set up authenticator',
            path: '/mfa/enrol',
            error: err.message,
            secret: enrolment.secret,
            qrDataUrl: enrolment.qrDataUrl,
            enrolToken: enrolment.enrolToken,
            csrfToken
          });
        } catch (e) {
          return next(e);
        }
      }
      return next(err);
    }
  });

  // --- Login step-up ---
  router.get('/mfa/verify', async (req, res) => {
    if (!req.session?.pendingMfaUser) {
      return res.redirect('/sign-in');
    }
    const csrfToken = await freshCsrf(req);
    res.render('auth/mfa-verify', {
      title: 'Verify authenticator',
      path: '/mfa/verify',
      error: null,
      csrfToken
    });
  });

  router.post('/mfa/verify', loginLimiter, async (req, res, next) => {
    // Soft CSRF: on mismatch, re-show form with a fresh token instead of hard 403 page
    const token =
      req.body?._csrf ||
      req.get('x-csrf-token') ||
      req.get('csrf-token');
    const expected = req.session?.csrfToken;
    const csrfOk =
      expected &&
      token &&
      Buffer.from(String(token)).length === Buffer.from(String(expected)).length &&
      require('node:crypto').timingSafeEqual(
        Buffer.from(String(token)),
        Buffer.from(String(expected))
      );

    if (!csrfOk) {
      console.error('[GLOBE_CSRF] mfa/verify soft-fail', JSON.stringify({
        hasExpected: Boolean(expected),
        hasToken: Boolean(token),
        tokenStart: token ? String(token).slice(0, 8) : null,
        expectedStart: expected ? String(expected).slice(0, 8) : null,
        sessionId: req.sessionID,
        hasPendingMfa: Boolean(req.session?.pendingMfaUser)
      }));

      if (!req.session?.pendingMfaUser) {
        return res.redirect('/sign-in');
      }
      const csrfToken = await freshCsrf(req);
      return res.status(403).render('auth/mfa-verify', {
        title: 'Verify authenticator',
        path: '/mfa/verify',
        error: 'Security token expired. Enter a fresh code from your app and try again.',
        csrfToken
      });
    }

    try {
      const pending = req.session.pendingMfaUser;
      if (!pending?.id) {
        return res.redirect('/sign-in');
      }
      const code = parseCode(req.body);
      await mfaService.verifyLoginCode(pending.id, code);

      const STAFF = ['admin', 'kyc_reviewer', 'support_agent', 'operations', 'auditor'];
      let roles = Array.isArray(pending.roles) ? [...pending.roles] : [];
      if (roles.length === 0) roles = ['customer'];

      const defaultHome = roles.some((r) => STAFF.includes(r)) ? '/admin' : '/dashboard';
      const nextUrl =
        typeof req.session.pendingMfaNext === 'string' &&
        req.session.pendingMfaNext.startsWith('/') &&
        !req.session.pendingMfaNext.startsWith('//')
          ? req.session.pendingMfaNext
          : defaultHome;

      await new Promise((resolve, reject) => {
        req.session.regenerate((err) => (err ? reject(err) : resolve()));
      });

      req.session.user = { ...pending, roles };
      try {
        if (customerRepo?.getCountryCode) {
          req.session.user.countryCode = await customerRepo.getCountryCode(pending.id);
        }
      } catch (_) {}
      delete req.session.pendingMfaUser;
      delete req.session.pendingMfaNext;
      req.session.csrfToken = crypto.randomBytes(32).toString('base64url');
      await saveSession(req);
      return res.redirect(303, nextUrl);
    } catch (err) {
      if (err.status === 400 || err.status === 401) {
        const csrfToken = await freshCsrf(req);
        return res.status(err.status).render('auth/mfa-verify', {
          title: 'Verify authenticator',
          path: '/mfa/verify',
          error: err.message,
          csrfToken
        });
      }
      return next(err);
    }
  });

  return router;
}

module.exports = { createMfaRouter };