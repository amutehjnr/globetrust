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
const { createTransferRouter } = require('./modules/transfers/transfer.routes');
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

function createApp(pool) {
  const app = express();
  const userRepo = createUserRepository(pool);
  const tokenRepo = createAuthTokenRepository(pool);
  const authService = createAuthService({ userRepo, tokenRepo, logger });
  const mfaService = createMfaService({ pool, logger });
  const customerRepo = createCustomerRepository(pool);
  const adminRepo = createAdminRepository(pool);
  const kycUpload = createKycUploadService({ customerRepo, logger });
  const kycView = createKycViewService({ logger });
  const coreBanking = createCoreBankingAdapter();
  const transferRepo = createTransferRepository(pool);
  const transferService = createTransferService({ transferRepo, coreBanking, logger });
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
        imgSrc: ["'self'", "data:", "https://flagcdn.com"],
        styleSrc: ["'self'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
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
  app.use(createAuthRouter({ authService }));
  app.use(createMfaRouter({ mfaService }));
  // Admin before customer so /admin is never swallowed by portal middleware
  app.use(createAdminRouter({ adminRepo, customerRepo, kycView, userRepo }));
  app.use(createCustomerRouter({ customerRepo, kycUpload, transferRepo, transferService, mfaService }));
  app.use(createTransferRouter({ transferService, transferRepo, coreBanking, mfaService }));
  app.use(createSupportRouter({ supportService, supportRepo }));
  const auditRepo = createAuditRepository(pool);
  app.use(createAuditRouter({ auditRepo }));
  app.set('supportService', supportService);

  app.use((_req, res) => res.status(404).render('errors/404', { title: 'Page not found' }));

  app.use((err, req, res, _next) => {
    req.log?.error({ err }, 'Unhandled request error');
    if (res.headersSent) return;
    const status = err.status || 500;
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