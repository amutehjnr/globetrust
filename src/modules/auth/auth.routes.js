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

/** Staff roles → /admin; customers → /dashboard */
const STAFF_ROLES = ['admin', 'kyc_reviewer', 'support_agent', 'operations', 'auditor'];

function defaultHomeForRoles(roles) {
  const list = Array.isArray(roles) ? roles : [];
  if (list.some((r) => STAFF_ROLES.includes(r))) return '/admin';
  return '/dashboard';
}

function safeNextUrl(raw, roles) {
  if (typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//')) {
    return raw;
  }
  return defaultHomeForRoles(roles);
}

function createAuthRouter({ authService }) {
  const router = express.Router();

  // Compatibility aliases (older links / bookmarks)
  router.get('/login', (req, res) => {
    const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    return res.redirect(302, `/sign-in${q}`);
  });
  router.get('/open-account', (_req, res) => res.redirect(302, '/register'));

  router.get('/sign-in', (req, res) => {
    if (req.session?.user) {
      return res.redirect(defaultHomeForRoles(req.session.user.roles));
    }
    res.render('auth/sign-in', {
      title: 'Sign in',
      path: '/sign-in',
      error: null,
      next: req.query.next || ''
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

      let roles = Array.isArray(result.user.roles) ? [...result.user.roles] : [];
      // Only default to customer when no roles were assigned
      if (roles.length === 0) {
        roles = ['customer'];
      }

      const nextUrl = safeNextUrl(req.body.next, roles);

      if (result.needsMfa) {
        req.session.pendingMfaUser = { ...result.user, roles };
        req.session.pendingMfaNext = nextUrl;
        return res.redirect('/mfa/verify');
      }

      req.session.user = { ...result.user, roles };
      req.session.mustEnrollMfa = result.mustEnrollMfa;
      return res.redirect(nextUrl);
    } catch (err) {
      if (err.status === 400 || err.status === 401 || err.status === 423) {
        return res.status(err.status).render('auth/sign-in', {
          title: 'Sign in',
          path: '/sign-in',
          error: err.message,
          next: req.body.next || ''
        });
      }
      return next(err);
    }
  });

  router.get('/register', (req, res) => {
    if (req.session?.user) {
      return res.redirect(defaultHomeForRoles(req.session.user.roles));
    }
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

  router.post('/sign-out', (req, res, next) => {
    const finish = () => {
      res.clearCookie(process.env.SESSION_COOKIE_NAME || 'gtb.sid');
      return res.redirect('/');
    };

    if (!req.session) {
      return finish();
    }

    req.session.destroy((err) => {
      if (err) {
        return finish();
      }
      return finish();
    });
  });

  // Optional GET fallback (e.g. bookmark / expired form)
  router.get('/sign-out', (req, res) => {
    const finish = () => {
      res.clearCookie(process.env.SESSION_COOKIE_NAME || 'gtb.sid');
      return res.redirect('/');
    };
    if (!req.session) return finish();
    req.session.destroy(() => finish());
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