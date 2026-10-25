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
const { COUNTRIES } = require('../../utils/countries');
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
  router.get('/auth/login', (req, res) => {
    const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    return res.redirect(302, `/sign-in${q}`);
  });
  router.get('/auth/sign-in', (req, res) => {
    const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    return res.redirect(302, `/sign-in${q}`);
  });
  router.get('/auth/forgot-password', (_req, res) => res.redirect(302, '/forgot-password'));
  router.get('/auth/register', (_req, res) => res.redirect(302, '/register'));

  router.get('/sign-in', (req, res) => {
    if (req.session?.user) {
      return res.redirect(303, defaultHomeForRoles(req.session.user.roles));
    }
    res.render('auth/sign-in', {
      title: 'Sign in',
      path: '/sign-in',
      error: null,
      next: req.query.next || ''
    });
  });

  async function handleSignIn(req, res, next) {
    console.log('[GLOBE_LOGIN] attempt', JSON.stringify({
      path: req.path || req.url,
      email: req.body?.email || null,
      hasPassword: Boolean(req.body?.password),
      hasCsrf: Boolean(req.body?._csrf),
      next: req.body?.next || null,
      hasSession: Boolean(req.session)
    }));
    try {
      const data = parseBody(loginSchema, req.body);
      const result = await authService.login({
        email: data.email,
        password: data.password,
        ip: req.ip,
        userAgent: req.get('user-agent')
      });

      console.log('[GLOBE_LOGIN] authService.ok', JSON.stringify({
        userId: result.user?.id,
        email: result.user?.email,
        roles: result.user?.roles,
        needsMfa: result.needsMfa,
        mustEnrollMfa: result.mustEnrollMfa
      }));

      await new Promise((resolve, reject) => {
        req.session.regenerate((err) => (err ? reject(err) : resolve()));
      });

      let roles = Array.isArray(result.user.roles) ? [...result.user.roles] : [];
      if (roles.length === 0) {
        console.warn('[GLOBE_LOGIN] no roles from DB — defaulting to customer');
        roles = ['customer'];
      }

      const nextUrl = safeNextUrl(req.body.next, roles);
      console.log('[GLOBE_LOGIN] redirect', JSON.stringify({ roles, nextUrl }));

      if (result.needsMfa) {
        req.session.pendingMfaUser = { ...result.user, roles };
        req.session.pendingMfaNext = nextUrl;
        await new Promise((resolve, reject) => {
          req.session.save((err) => (err ? reject(err) : resolve()));
        });
        return res.redirect(303, '/mfa/verify');
      }

      req.session.user = { ...result.user, roles };
      req.session.mustEnrollMfa = result.mustEnrollMfa;

      // Ensure session is saved before redirect (critical on serverless)
      await new Promise((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
      });

      return res.redirect(303, nextUrl);
    } catch (err) {
      console.error('[GLOBE_LOGIN] failed', JSON.stringify({
        message: err.message,
        status: err.status,
        name: err.name,
        stack: err.stack
      }, null, 2));
      if (err.stack) console.error(err.stack);

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
  }

  // Canonical + legacy form actions
  // Production has posted to /sign-in, /auth/login, and /auth/sign-in
  router.post('/sign-in', loginLimiter, requireCsrf, handleSignIn);
  router.post('/auth/login', loginLimiter, requireCsrf, handleSignIn);
  router.post('/auth/sign-in', loginLimiter, requireCsrf, handleSignIn);

  router.get('/register', (req, res) => {
    if (req.session?.user) {
      return res.redirect(303, defaultHomeForRoles(req.session.user.roles));
    }
    res.render('auth/register', {
      title: 'Register',
      path: '/register',
      error: null,
      values: {},
      countries: COUNTRIES
    });
  });

  async function handleRegister(req, res, next) {
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
            phoneE164: req.body.phoneE164,
            countryCode: req.body.countryCode
          },
          countries: COUNTRIES
        });
      }
      return next(err);
    }
  }

  router.post('/register', registerLimiter, requireCsrf, handleRegister);
  router.post('/auth/register', registerLimiter, requireCsrf, handleRegister);

  router.post('/sign-out', (req, res) => {
    const finish = () => {
      res.clearCookie(process.env.SESSION_COOKIE_NAME || 'gtb.sid');
      return res.redirect('/');
    };
    if (!req.session) return finish();
    req.session.destroy(() => finish());
  });

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

  async function handleForgot(req, res, next) {
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
  }

  router.post('/forgot-password', recoveryLimiter, requireCsrf, handleForgot);
  router.post('/auth/forgot-password', recoveryLimiter, requireCsrf, handleForgot);

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