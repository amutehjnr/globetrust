'use strict';

const express = require('express');
const {
  registerSchema,
  loginSchema,
  forgotSchema,
  resetSchema,
  parseBody
} = require('../../validators/authValidators');
const { requireCsrf } = require('../../middleware/csrf');
const {
  loginLimiter,
  registerLimiter,
  recoveryLimiter
} = require('../../middleware/rateLimit');

function createAuthRouter({ authService }) {
  const router = express.Router();

  router.get('/sign-in', (req, res) => {
    if (req.session?.user) return res.redirect('/app');
    res.render('auth/sign-in', {
      title: 'Sign in',
      path: '/sign-in',
      error: null,
      next: req.query.next || '/app'
    });
  });

  router.post('/sign-in', loginLimiter, requireCsrf, async (req, res, next) => {
    try {
      const data = parseBody(loginSchema, req.body);
      const result = await authService.login({
        email: data.email,
        password: data.password,
        ip: req.ip,
        userAgent: req.get('user-agent')
      });

      // Session fixation mitigation
      await new Promise((resolve, reject) => {
        req.session.regenerate((err) => (err ? reject(err) : resolve()));
      });

      if (result.needsMfa) {
        req.session.pendingMfaUser = result.user;
        return res.redirect('/mfa/verify');
      }

      req.session.user = result.user;
      req.session.mustEnrollMfa = result.mustEnrollMfa;
      const nextUrl = typeof req.body.next === 'string' && req.body.next.startsWith('/')
        ? req.body.next
        : '/app';
      return res.redirect(nextUrl);
    } catch (err) {
      if (err.status === 400 || err.status === 401 || err.status === 423) {
        return res.status(err.status).render('auth/sign-in', {
          title: 'Sign in',
          path: '/sign-in',
          error: err.message,
          next: req.body.next || '/app'
        });
      }
      return next(err);
    }
  });

  router.get('/register', (req, res) => {
    if (req.session?.user) return res.redirect('/app');
    res.render('auth/register', {
      title: 'Register',
      path: '/register',
      error: null,
      values: {}
    });
  });

  router.post('/register', registerLimiter, requireCsrf, async (req, res, next) => {
    try {
      const data = parseBody(registerSchema, {
        ...req.body,
        phoneE164: req.body.phoneE164 || undefined
      });
      await authService.register(data);
      return res.render('auth/register-done', {
        title: 'Check your email',
        path: '/register'
      });
    } catch (err) {
      if (err.status === 400 || err.status === 409) {
        return res.status(err.status).render('auth/register', {
          title: 'Register',
          path: '/register',
          error: err.message,
          values: {
            email: req.body.email,
            firstName: req.body.firstName,
            lastName: req.body.lastName,
            phoneE164: req.body.phoneE164
          }
        });
      }
      return next(err);
    }
  });

  router.post('/sign-out', requireCsrf, (req, res, next) => {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie(process.env.SESSION_COOKIE_NAME || 'gtb.sid');
      res.redirect('/');
    });
  });

  router.get('/forgot-password', (req, res) => {
    res.render('auth/forgot-password', {
      title: 'Forgot password',
      path: '/forgot-password',
      error: null,
      success: null,
      devToken: null
    });
  });

  router.post('/forgot-password', recoveryLimiter, requireCsrf, async (req, res, next) => {
    try {
      const data = parseBody(forgotSchema, req.body);
      const result = await authService.requestPasswordReset(data.email, req.ip);
      return res.render('auth/forgot-password', {
        title: 'Forgot password',
        path: '/forgot-password',
        error: null,
        success: 'If an account exists for that email, reset instructions have been issued.',
        devToken: result.devResetToken || null
      });
    } catch (err) {
      if (err.status === 400) {
        return res.status(400).render('auth/forgot-password', {
          title: 'Forgot password',
          path: '/forgot-password',
          error: err.message,
          success: null,
          devToken: null
        });
      }
      return next(err);
    }
  });

  router.get('/reset-password', (req, res) => {
    res.render('auth/reset-password', {
      title: 'Reset password',
      path: '/reset-password',
      error: null,
      token: req.query.token || ''
    });
  });

  router.post('/reset-password', recoveryLimiter, requireCsrf, async (req, res, next) => {
    try {
      const data = parseBody(resetSchema, req.body);
      await authService.resetPassword(data.token, data.password);
      return res.render('auth/reset-done', {
        title: 'Password updated',
        path: '/reset-password'
      });
    } catch (err) {
      if (err.status === 400) {
        return res.status(400).render('auth/reset-password', {
          title: 'Reset password',
          path: '/reset-password',
          error: err.message,
          token: req.body.token || ''
        });
      }
      return next(err);
    }
  });

  return router;
}

module.exports = { createAuthRouter };
