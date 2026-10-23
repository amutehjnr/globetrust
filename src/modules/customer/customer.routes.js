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
  router.use(requireAuth);
  router.use(requireRole('customer', 'admin', 'support_agent', 'kyc_reviewer', 'operations', 'auditor'));

  router.get('/app', async (req, res, next) => {
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
        path: '/app',
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

  return router;
}

module.exports = { createCustomerRouter };
