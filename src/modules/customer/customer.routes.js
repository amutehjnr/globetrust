'use strict';

const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const { requireAuth, requireRole } = require('../../middleware/authz');
const { requireCsrf } = require('../../middleware/csrf');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }
});

const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  middleName: z.string().trim().max(100).optional().or(z.literal('')),
  countryCode: z.string().length(2).optional().or(z.literal('')),
  preferredLocale: z.string().max(12).optional().or(z.literal(''))
});

function createCustomerRouter({ customerRepo, kycUpload, transferRepo, transferService, mfaService }) {
  const router = express.Router();
  // Only protect customer portal paths — do not run on /admin or public routes
  const portalGuard = [
    requireAuth,
    requireRole('customer', 'admin', 'support_agent', 'kyc_reviewer', 'operations', 'auditor')
  ];
  router.use('/dashboard', ...portalGuard);
  router.use('/app', ...portalGuard);

  // Primary customer dashboard
  router.get('/dashboard', async (req, res, next) => {
    try {
      const userId = req.session.user.id;
      const profile = await customerRepo.getProfile(userId);
      const kyc = await customerRepo.listKycDocuments(userId);

      let accounts = [];
      let recentTransfers = [];
      let mfaStatus = { enrolled: false, required: true };

      if (transferRepo && transferService) {
        await transferRepo.ensureSandboxLink(userId, 'NGN');
        await transferRepo.ensureSandboxLink(userId, 'USD');
        const links = await transferRepo.listLinksWithExternal(userId);
        accounts = await transferService.getBalancesForLinks(links);
        recentTransfers = await transferRepo.listForUser(userId, 5);
      }

      if (mfaService) {
        mfaStatus = await mfaService.getStatus(userId);
      }

      const kycPending = kyc.filter((d) => d.verificationStatus === 'pending').length;
      const kycApproved = kyc.filter((d) => d.verificationStatus === 'approved').length;

      res.render('customer/dashboard', {
        title: 'Dashboard',
        path: '/dashboard',
        profile,
        accounts,
        recentTransfers,
        kyc,
        kycPending,
        kycApproved,
        mfaStatus,
        mustEnrollMfa: Boolean(req.session.mustEnrollMfa) || (mfaStatus.required && !mfaStatus.enrolled)
      });
    } catch (err) {
      next(err);
    }
  });

  // Avoid 404 if a client re-POSTs to /dashboard after login
  router.post('/dashboard', (req, res) => res.redirect(303, '/dashboard'));

  // Legacy alias — old /app links land on dashboard
  router.get('/app', (_req, res) => res.redirect(302, '/dashboard'));

  router.get('/app/profile', async (req, res, next) => {
    try {
      const profile = await customerRepo.getProfile(req.session.user.id);
      res.render('customer/profile', {
        title: 'Profile',
        path: '/app/profile',
        profile,
        error: null,
        success: null
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/app/profile', requireCsrf, async (req, res, next) => {
    try {
      const data = profileSchema.parse(req.body);
      await customerRepo.updateProfile(req.session.user.id, data);
      const profile = await customerRepo.getProfile(req.session.user.id);
      res.render('customer/profile', {
        title: 'Profile',
        path: '/app/profile',
        profile,
        error: null,
        success: 'Profile updated.'
      });
    } catch (err) {
      if (err.name === 'ZodError') {
        const profile = await customerRepo.getProfile(req.session.user.id);
        return res.status(400).render('customer/profile', {
          title: 'Profile',
          path: '/app/profile',
          profile,
          error: (err.issues || err.errors || []).map((e) => e.message).join('; '),
          success: null
        });
      }
      next(err);
    }
  });

  router.get('/app/kyc', async (req, res, next) => {
    try {
      const docs = await customerRepo.listKycDocuments(req.session.user.id);
      res.render('customer/kyc', {
        title: 'Identity verification',
        path: '/app/kyc',
        docs,
        error: null,
        success: null
      });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/app/kyc',
    requireCsrf,
    upload.single('document'),
    async (req, res, next) => {
      try {
        await kycUpload.submit({
          userId: req.session.user.id,
          documentType: req.body.documentType,
          file: req.file
        });
        const docs = await customerRepo.listKycDocuments(req.session.user.id);
        res.render('customer/kyc', {
          title: 'Identity verification',
          path: '/app/kyc',
          docs,
          error: null,
          success: 'Document submitted for review. Do not upload the same file repeatedly.'
        });
      } catch (err) {
        if (err.status === 400) {
          const docs = await customerRepo.listKycDocuments(req.session.user.id);
          return res.status(400).render('customer/kyc', {
            title: 'Identity verification',
            path: '/app/kyc',
            docs,
            error: err.message,
            success: null
          });
        }
        next(err);
      }
    }
  );

   
  function pageLocals(req, extra = {}) {
    const u = req.session.user || {};
    const name = u.email ? String(u.email).split('@')[0] : 'Customer';
    return {
      displayName: name,
      initials: name.slice(0, 2).toUpperCase(),
      ...extra
    };
  }

  router.get('/app/accounts', async (req, res, next) => {
    try {
      let accounts = [];
      if (transferRepo && transferService) {
        await transferRepo.ensureSandboxLink(req.session.user.id, 'NGN');
        await transferRepo.ensureSandboxLink(req.session.user.id, 'USD');
        const links = await transferRepo.listLinksWithExternal(req.session.user.id);
        accounts = await transferService.getBalancesForLinks(links);
      }
      res.render('customer/accounts', pageLocals(req, {
        title: 'Accounts',
        path: '/app/accounts',
        accounts
      }));
    } catch (err) { next(err); }
  });

  router.get('/app/cards', (req, res) => {
    res.render('customer/cards', pageLocals(req, {
      title: 'Cards',
      path: '/app/cards'
    }));
  });

  router.get('/app/beneficiaries', (req, res) => {
    res.render('customer/beneficiaries', pageLocals(req, {
      title: 'Beneficiaries',
      path: '/app/beneficiaries',
      beneficiaries: [] // wire to DB later
    }));
  });

  router.get('/app/statements', async (req, res, next) => {
    try {
      let history = [];
      if (transferRepo) {
        history = await transferRepo.listForUser(req.session.user.id, 50);
      }
      res.render('customer/statements', pageLocals(req, {
        title: 'Statements',
        path: '/app/statements',
        history
      }));
    } catch (err) { next(err); }
  });

  router.get('/app/exchange', (req, res) => {
    res.render('customer/exchange', pageLocals(req, {
      title: 'Exchange rates',
      path: '/app/exchange',
      rates: [
        { pair: 'USD / NGN', mid: '1,580.00', change: '+0.4%' },
        { pair: 'GBP / NGN', mid: '2,010.00', change: '-0.2%' },
        { pair: 'EUR / NGN', mid: '1,720.00', change: '+0.1%' },
        { pair: 'USD / EUR', mid: '0.92', change: '0.0%' },
        { pair: 'USD / GBP', mid: '0.79', change: '-0.1%' },
        { pair: 'EUR / GBP', mid: '0.86', change: '+0.1%' }
      ]
    }));
  });

  router.get('/app/settings', async (req, res, next) => {
    try {
      const profile = await customerRepo.getProfile(req.session.user.id);
      let mfaStatus = { enrolled: false, required: true };
      if (mfaService) mfaStatus = await mfaService.getStatus(req.session.user.id);
      res.render('customer/settings', pageLocals(req, {
        title: 'Settings',
        path: '/app/settings',
        profile,
        mfaStatus
      }));
    } catch (err) { next(err); }
  });

  return router;
}

module.exports = { createCustomerRouter };