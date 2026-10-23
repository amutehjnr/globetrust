'use strict';

const express = require('express');
const { z } = require('zod');
const { requireCsrf } = require('../../middleware/csrf');
const { requireAuth } = require('../../middleware/authz');
const { loginLimiter } = require('../../middleware/rateLimit');

const codeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app')
});

function parseCode(body) {
  const r = codeSchema.safeParse(body);
  if (!r.success) {
    const err = new Error(r.error.issues[0].message);
    err.status = 400;
    throw err;
  }
  return r.data.code;
}

function createMfaRouter({ mfaService }) {
  const router = express.Router();

  // --- Enrolment (authenticated, not yet fully enrolled) ---
  router.get('/mfa/enrol', requireAuth, async (req, res, next) => {
    try {
      const status = await mfaService.getStatus(req.session.user.id);
      if (status.enrolled) {
        return res.redirect('/app');
      }
      const enrolment = await mfaService.beginEnrolment(
        req.session.user.id,
        req.session.user.email
      );
      // Keep pending secret only server-side; do not put secret in session long-term ideally
      req.session.mfaEnrolPending = true;
      res.render('auth/mfa-enrol', {
        title: 'Set up authenticator',
        path: '/mfa/enrol',
        error: null,
        secret: enrolment.secret,
        qrDataUrl: enrolment.qrDataUrl
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/mfa/enrol', requireAuth, requireCsrf, loginLimiter, async (req, res, next) => {
    try {
      const code = parseCode(req.body);
      await mfaService.confirmEnrolment(req.session.user.id, code);
      delete req.session.mustEnrollMfa;
      delete req.session.mfaEnrolPending;
      return res.render('auth/mfa-done', {
        title: 'Authenticator enabled',
        path: '/mfa/enrol'
      });
    } catch (err) {
      if (err.status === 400) {
        // Re-show enrol form with same secret if still pending
        try {
          const enrolment = await mfaService.beginEnrolment(
            req.session.user.id,
            req.session.user.email,
            { rotate: false }
          );
          return res.status(400).render('auth/mfa-enrol', {
            title: 'Set up authenticator',
            path: '/mfa/enrol',
            error: err.message,
            secret: enrolment.secret,
            qrDataUrl: enrolment.qrDataUrl
          });
        } catch (e) {
          return next(e);
        }
      }
      return next(err);
    }
  });

  // --- Login step-up ---
  router.get('/mfa/verify', (req, res) => {
    if (!req.session?.pendingMfaUser) {
      return res.redirect('/sign-in');
    }
    res.render('auth/mfa-verify', {
      title: 'Verify authenticator',
      path: '/mfa/verify',
      error: null
    });
  });

  router.post('/mfa/verify', loginLimiter, requireCsrf, async (req, res, next) => {
    try {
      const pending = req.session.pendingMfaUser;
      if (!pending?.id) {
        return res.redirect('/sign-in');
      }
      const code = parseCode(req.body);
      await mfaService.verifyLoginCode(pending.id, code);

      await new Promise((resolve, reject) => {
        req.session.regenerate((err) => (err ? reject(err) : resolve()));
      });
      req.session.user = pending;
      delete req.session.pendingMfaUser;
      return res.redirect('/app');
    } catch (err) {
      if (err.status === 400 || err.status === 401) {
        return res.status(err.status).render('auth/mfa-verify', {
          title: 'Verify authenticator',
          path: '/mfa/verify',
          error: err.message
        });
      }
      return next(err);
    }
  });

  return router;
}

module.exports = { createMfaRouter };
