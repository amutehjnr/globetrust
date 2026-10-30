'use strict';

const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const { pinoHttp } = require('pino-http');
const logger = require('./config/logger');
const { generalLimiter } = require('./middleware/rateLimit');
const { createSessionMiddleware } = require('./middleware/session');
const { ensureCsrfToken, localsCsrf, requireCsrf } = require('./middleware/csrf');
const { requireAuth, attachUserLocals } = require('./middleware/authz');
const { createAuthRouter } = require('./modules/auth/auth.routes');
const { createMfaRouter } = require('./modules/auth/mfa.routes');
const { createMfaService } = require('./services/mfaService');
const { createCustomerRepository } = require('./repositories/customerRepository');
const { createAdminRepository } = require('./repositories/adminRepository');
const { createKycUploadService } = require('./services/kycUploadService');
const { createKycViewService } = require('./services/kycViewService');
const { createCustomerRouter } = require('./modules/customer/customer.routes');
const { createAdminRouter } = require('./modules/admin/admin.routes');
const { createCoreBankingAdapter } = require('./integrations/coreBanking');
const { createTransferRepository } = require('./repositories/transferRepository');
const { createTransferService } = require('./services/transferService');
const transferRoutesMod = require('./modules/transfers/transfer.routes');
const createTransferRouter =
  typeof transferRoutesMod === 'function'
    ? transferRoutesMod
    : transferRoutesMod.createTransferRouter;
const { createSupportRepository } = require('./repositories/supportRepository');
const { createSupportService } = require('./services/supportService');
const { createSupportRouter } = require('./modules/support/support.routes');
const { createHealthRouter } = require('./modules/ops/health.routes');
const { createMetricsRouter } = require('./modules/ops/metrics.routes');
const { createAuditRepository } = require('./repositories/auditRepository');
const { createAuditRouter } = require('./modules/admin/audit.routes');
const { createUserRepository } = require('./repositories/userRepository');
const { createAuthTokenRepository } = require('./repositories/authTokenRepository');
const { createAuthService } = require('./services/authService');
const { createEmailService } = require('./services/emailService');
const { createTransactionAlertService } = require('./services/transactionAlertService');

function createApp(pool) {
  const app = express();
  const userRepo = createUserRepository(pool);
  const tokenRepo = createAuthTokenRepository(pool);
  const emailService = createEmailService({ logger });
  const authService = createAuthService({ userRepo, tokenRepo, logger, emailService });
  const mfaService = createMfaService({ pool, logger });
  const customerRepo = createCustomerRepository(pool);
  const adminRepo = createAdminRepository(pool);
  const kycUpload = createKycUploadService({ customerRepo, logger });
  const kycView = createKycViewService({ logger });
  const coreBanking = createCoreBankingAdapter();
  const transferRepo = createTransferRepository(pool);
  const alertService = createTransactionAlertService({ emailService, userRepo, logger });
  const transferService = createTransferService({ transferRepo, coreBanking, logger, alertService });
  const supportRepo = createSupportRepository(pool);
  const supportService = createSupportService({ supportRepo });

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.set('trust proxy', Number(process.env.TRUST_PROXY || 0));

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://flagcdn.com",
          "https://logo.clearbit.com",
          "https://ui-avatars.com",
          "https://www.gstatic.com",
          "https://translate.google.com",
          "https://fonts.gstatic.com",
          "https://www.google.com",
          "https://*.googleusercontent.com"
        ],
        styleSrc: ["'self'", "https://fonts.googleapis.com", "https://www.gstatic.com", "https://translate.googleapis.com", "'unsafe-inline'"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://www.gstatic.com", "data:"],
        scriptSrc: ["'self'", "'unsafe-eval'", "'unsafe-inline'", "https://translate.google.com", "https://translate.googleapis.com", "https://www.gstatic.com", "https://www.google.com", "https://translate-pa.googleapis.com"],
        scriptSrcElem: ["'self'", "'unsafe-inline'", "https://translate.google.com", "https://translate.googleapis.com", "https://www.gstatic.com", "https://www.google.com", "https://translate-pa.googleapis.com"],
        connectSrc: ["'self'", "https://translate.googleapis.com", "https://translate.google.com", "https://www.google.com", "https://www.gstatic.com", "https://translate-pa.googleapis.com"],
        frameSrc: ["'self'", "https://translate.google.com", "https://www.google.com", "https://translate.googleapis.com"],
        workerSrc: ["'self'", "blob:"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
      }
    },
    crossOriginEmbedderPolicy: false
  }));
  app.use(compression());
  app.use(express.json({
    limit: '100kb',
    strict: true,
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    }
  }));
  app.use(express.urlencoded({ extended: false, limit: '50kb' }));
  app.use(cookieParser());
  app.use(pinoHttp({
    logger,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body.password',
        'req.body.otp',
        'req.body.token',
        'res.headers.set-cookie'
      ],
      censor: '[REDACTED]'
    }
  }));
  app.use(express.static(path.join(__dirname, '..', 'public'), {
    index: false,
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
    dotfiles: 'deny'
  }));

  app.use(createSessionMiddleware());
  app.use(ensureCsrfToken);
  app.use(localsCsrf);
  app.use(attachUserLocals);
  app.use(generalLimiter);
  app.use(createHealthRouter({ pool }));
  app.use(createMetricsRouter());


  app.get('/', (_req, res) => {
    res.render('public/home', {
      title: 'Home',
      message: 'Banking with confidence.',
      path: '/'
    });
  });

  const publicPages = ['personal', 'business', 'security', 'about', 'contact'];
  for (const page of publicPages) {
    app.get(`/${page}`, (_req, res) => {
      res.render(`public/${page}`, { title: page, path: `/${page}` });
    });
  }

  // Legacy path used in some links
  app.get('/app/dashboard', (_req, res) => res.redirect(302, '/dashboard'));

  // Auth routes (includes /sign-in, /register, etc.)
  app.use(createAuthRouter({ authService, customerRepo }));
  app.use(createMfaRouter({ mfaService, customerRepo }));
  // Admin before customer so /admin is never swallowed by portal middleware
  app.use(createAdminRouter({ adminRepo, customerRepo, kycView, userRepo, transferRepo, alertService, mfaService }));
  app.use(createCustomerRouter({ customerRepo, kycUpload, transferRepo, transferService, mfaService }));
  app.use(createTransferRouter({ transferService, transferRepo, coreBanking, mfaService, customerRepo }));
  app.use(createSupportRouter({ supportService, supportRepo }));
  const auditRepo = createAuditRepository(pool);
  app.use(createAuditRouter({ auditRepo }));
  app.set('supportService', supportService);


  app.use((req, res) => {
    console.error('[GLOBE_404]', JSON.stringify({
      method: req.method,
      url: req.originalUrl || req.url,
      path: req.path,
      sessionUser: req.session?.user
        ? { id: req.session.user.id, email: req.session.user.email, roles: req.session.user.roles }
        : null,
      hasSession: Boolean(req.session),
      csrf: Boolean(req.session?.csrfToken)
    }));
    return res.status(404).render('errors/404', { title: 'Page not found' });
  });

  app.use((err, req, res, _next) => {
    const status = err.status || 500;
    console.error('[GLOBE_ERROR]', JSON.stringify({
      status,
      message: err.message,
      name: err.name,
      code: err.code,
      stack: err.stack,
      method: req.method,
      url: req.originalUrl || req.url,
      path: req.path,
      sessionUser: req.session?.user
        ? { id: req.session.user.id, email: req.session.user.email, roles: req.session.user.roles }
        : null,
      bodyKeys: req.body && typeof req.body === 'object' ? Object.keys(req.body) : []
    }, null, 2));
    if (err.stack) console.error(err.stack);

    req.log?.error({ err, status }, 'Unhandled request error');
    if (res.headersSent) return;

    // Temporary debug: surface message when DEBUG_ERRORS=true (Vercel env)
    if (process.env.DEBUG_ERRORS === 'true' && status >= 500) {
      res.status(status);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.end(
        `Error ${status}\n${err.message}\n\n${err.stack || ''}\n\n` +
        `url=${req.originalUrl}\nmethod=${req.method}\n`
      );
    }

    if (status === 403) {
      return res.status(403).render('errors/403', { title: 'Access denied' });
    }
    res.status(status >= 400 && status < 600 ? status : 500).render('errors/500', {
      title: 'Something went wrong'
    });
  });

  return app;
}

module.exports = { createApp };