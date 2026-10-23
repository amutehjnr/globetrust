'use strict';

const express = require('express');
const { requireAuth, requireRole } = require('../../middleware/authz');
const { requireCsrf } = require('../../middleware/csrf');
const { isUuid } = require('../../utils/ids');

function createAdminRouter({ adminRepo, customerRepo, kycView }) {
  const router = express.Router();

  router.use(requireAuth);
  router.use(requireRole('admin', 'kyc_reviewer', 'support_agent', 'operations', 'auditor'));

  router.get('/admin', async (req, res, next) => {
    try {
      const dash = await adminRepo.dashboardStats();
      res.render('admin/overview', {
        title: 'Admin dashboard',
        path: '/admin',
        counts: dash.counts,
        usersByStatus: dash.usersByStatus,
        kycByStatus: dash.kycByStatus,
        transfersByStatus: dash.transfersByStatus,
        registrationsLast7: dash.registrationsLast7,
        pendingKycPreview: dash.pendingKycPreview,
        message: req.query.msg || null,
        error: req.query.err || null
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/admin/customers', async (req, res, next) => {
    try {
      const q = (req.query.q || '').trim();
      const results = q.length >= 2 ? await adminRepo.searchCustomers(q) : [];
      res.render('admin/customers', {
        title: 'Customers',
        path: '/admin/customers',
        q,
        results
      });
    } catch (err) {
      next(err);
    }
  });

  // ---- KYC queue (exact path — register before parameterized routes) ----
  async function renderKycQueue(req, res, next) {
    try {
      const queue = await adminRepo.listPendingKyc();
      res.render('admin/kyc-queue', {
        title: 'KYC review',
        path: '/admin/kyc',
        queue: queue || [],
        message: req.query.msg || null,
        error: req.query.err || null
      });
    } catch (err) {
      next(err);
    }
  }

  const kycStaff = requireRole('admin', 'kyc_reviewer');
  router.get('/admin/kyc', kycStaff, renderKycQueue);
  router.get('/admin/kyc/', kycStaff, renderKycQueue);

  // Document binary — more specific than /:id/review
  router.get(
    '/admin/kyc/documents/:id',
    requireRole('admin', 'kyc_reviewer'),
    async (req, res, next) => {
      try {
        if (!isUuid(req.params.id)) {
          return res.status(400).render('errors/404', {
            title: 'Invalid document',
            message: 'That document link is not valid.'
          });
        }
        const doc = await customerRepo.getKycDocumentById(req.params.id);
        if (!doc) {
          return res.status(404).render('errors/404', {
            title: 'Document not found',
            message: 'This KYC document was not found or has been removed.'
          });
        }
        const opened = await kycView.openDocument(doc);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'no-store');
        if (opened.mode === 'redirect') {
          return res.redirect(opened.url);
        }
        res.setHeader('Content-Type', opened.contentType);
        res.setHeader(
          'Content-Disposition',
          `inline; filename="${opened.filename}"`
        );
        opened.stream.on('error', next);
        opened.stream.pipe(res);
      } catch (err) {
        if (err.status === 400 || err.code === 'INVALID_UUID') {
          return res.status(400).render('errors/404', {
            title: 'Invalid document',
            message: err.message
          });
        }
        next(err);
      }
    }
  );

  // Dedicated review page
  router.get(
    '/admin/kyc/:id/review',
    requireRole('admin', 'kyc_reviewer'),
    async (req, res, next) => {
      try {
        if (!isUuid(req.params.id)) {
          return res.status(400).render('errors/404', {
            title: 'Invalid document',
            message: 'That review link is not valid.'
          });
        }
        const doc = await customerRepo.getKycDocumentById(req.params.id);
        if (!doc) {
          return res.status(404).render('errors/404', {
            title: 'Document not found',
            message: 'This KYC document was not found or has been removed.'
          });
        }
        res.render('admin/kyc-review', {
          title: 'Review document',
          path: '/admin/kyc',
          doc,
          error: null
        });
      } catch (err) {
        if (err.status === 400 || err.code === 'INVALID_UUID') {
          return res.status(400).render('errors/404', {
            title: 'Invalid document',
            message: err.message
          });
        }
        next(err);
      }
    }
  );

  router.post(
    '/admin/kyc/:id/review',
    requireRole('admin', 'kyc_reviewer'),
    requireCsrf,
    async (req, res, next) => {
      try {
        if (!isUuid(req.params.id)) {
          return res.redirect(
            `/admin/kyc?err=${encodeURIComponent('Invalid document id.')}`
          );
        }

        const decision = String(req.body.decision || '').toLowerCase();
        if (decision !== 'approved' && decision !== 'rejected') {
          return res.redirect(
            `/admin/kyc?err=${encodeURIComponent('Choose Approve or Reject.')}`
          );
        }

        if (decision === 'rejected' && !(req.body.reason || '').trim()) {
          const doc = await customerRepo.getKycDocumentById(req.params.id);
          if (!doc) {
            return res.redirect(
              `/admin/kyc?err=${encodeURIComponent('Document not found.')}`
            );
          }
          return res.status(400).render('admin/kyc-review', {
            title: 'Review document',
            path: '/admin/kyc',
            doc,
            error: 'A reason is required when rejecting a document.'
          });
        }

        await adminRepo.reviewKyc({
          documentId: req.params.id,
          reviewerUserId: req.session.user.id,
          status: decision,
          reason: req.body.reason || null
        });

        const redirectTo = req.body.returnTo === 'dashboard' ? '/admin' : '/admin/kyc';
        const msg =
          decision === 'approved' ? 'Document approved.' : 'Document rejected.';
        return res.redirect(`${redirectTo}?msg=${encodeURIComponent(msg)}`);
      } catch (err) {
        if (err.status === 400 || err.status === 409 || err.code === 'INVALID_UUID') {
          return res.redirect(
            `/admin/kyc?err=${encodeURIComponent(err.message)}`
          );
        }
        return next(err);
      }
    }
  );

  return router;
}

module.exports = { createAdminRouter };
