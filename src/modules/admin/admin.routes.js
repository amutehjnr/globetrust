'use strict';

const express = require('express');
const { z } = require('zod');
const { requireAuth, requireRole } = require('../../middleware/authz');
const { requireCsrf } = require('../../middleware/csrf');
const { isUuid } = require('../../utils/ids');
const { hashPassword } = require('../../utils/password');

const createUserSchema = z.object({
  email: z.string().email().max(254),
  password: z
    .string()
    .min(12)
    .max(128)
    .regex(/[A-Z]/)
    .regex(/[a-z]/)
    .regex(/[0-9]/),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phoneE164: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/)
    .optional()
    .or(z.literal('')),
  activate: z.enum(['yes', 'no']).optional()
});

function createAdminRouter({ adminRepo, customerRepo, kycView, userRepo }) {
  const router = express.Router();

  // Only protect /admin/* — do not intercept unrelated paths (avoids fallthrough 404s)
  router.use('/admin', requireAuth);
  router.use('/admin', requireRole('admin', 'kyc_reviewer', 'support_agent', 'operations', 'auditor'));

  function adminLocals(req, extra = {}) {
    const email = req.session.user?.email || 'admin';
    return {
      displayName: email.split('@')[0],
      initials: email.slice(0, 2).toUpperCase(),
      ...extra
    };
  }

  async function renderAdminOverview(req, res, next) {
    console.log('[GLOBE_ADMIN]', req.method, '/admin', JSON.stringify({
      user: req.session?.user
        ? { id: req.session.user.id, email: req.session.user.email, roles: req.session.user.roles }
        : null
    }));
    try {
      const dash = await adminRepo.dashboardStats();
      const recentCustomers = await adminRepo.listRecentCustomers(12);
      console.log('[GLOBE_ADMIN] dashboardStats ok', JSON.stringify({
        users: dash?.counts?.users,
        recent: Array.isArray(recentCustomers) ? recentCustomers.length : null
      }));
      res.render('admin/overview', adminLocals(req, {
        title: 'Admin dashboard',
        path: '/admin',
        counts: dash.counts,
        usersByStatus: dash.usersByStatus,
        kycByStatus: dash.kycByStatus,
        transfersByStatus: dash.transfersByStatus,
        registrationsLast7: dash.registrationsLast7,
        pendingKycPreview: dash.pendingKycPreview,
        recentCustomers,
        message: req.query.msg || null,
        error: req.query.err || null
      }));
    } catch (err) {
      console.error('[GLOBE_ADMIN] /admin failed', err?.message);
      console.error(err?.stack || err);
      next(err);
    }
  }

  // GET is normal; POST accepted too (PRG / form resubmit after login must not 404)
  router.get('/admin', renderAdminOverview);
  router.post('/admin', (req, res) => {
    console.warn('[GLOBE_ADMIN] POST /admin received — converting to GET (PRG)');
    return res.redirect(303, '/admin');
  });

  router.get('/admin/customers', async (req, res, next) => {
    try {
      const q = (req.query.q || '').trim();
      const results =
        q.length >= 2
          ? await adminRepo.searchCustomers(q)
          : await adminRepo.listRecentCustomers(25);
      res.render('admin/customers', adminLocals(req, {
        title: 'Customers',
        path: '/admin/customers',
        q,
        results
      }));
    } catch (err) {
      next(err);
    }
  });

  // ---- Create customer account (admin only) ----
  router.get(
    '/admin/customers/new',
    requireRole('admin'),
    (req, res) => {
      res.render('admin/create-customer', adminLocals(req, {
        title: 'Create customer',
        path: '/admin/customers',
        error: null,
        success: null,
        values: {}
      }));
    }
  );

  router.post(
    '/admin/customers/new',
    requireRole('admin'),
    requireCsrf,
    async (req, res, next) => {
      try {
        if (!userRepo) {
          const err = new Error('User repository not configured.');
          err.status = 500;
          throw err;
        }
        const data = createUserSchema.parse({
          ...req.body,
          phoneE164: req.body.phoneE164 || ''
        });

        const existing = await userRepo.findByEmail(data.email);
        if (existing) {
          return res.status(409).render('admin/create-customer', adminLocals(req, {
            title: 'Create customer',
            path: '/admin/customers',
            error: 'A user with this email already exists.',
            success: null,
            values: {
              email: data.email,
              firstName: data.firstName,
              lastName: data.lastName,
              phoneE164: data.phoneE164
            }
          }));
        }

        const passwordHash = await hashPassword(data.password);
        const activate = data.activate === 'yes';
        const created = await userRepo.createCustomer({
          email: data.email,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          phoneE164: data.phoneE164 || null,
          status: activate ? 'active' : 'pending'
        });

        const userId = created.id || created;

        // Audit
        try {
          await adminRepo.setUserStatus(userId, activate ? 'active' : 'pending', req.session.user.id);
        } catch {
          // status already set on insert; audit best-effort
        }

        return res.render('admin/create-customer', adminLocals(req, {
          title: 'Create customer',
          path: '/admin/customers',
          error: null,
          success: `Customer created${activate ? ' and activated' : ' (pending)'}. Reference: ${created.customerReference || userId}`,
          values: {}
        }));
      } catch (err) {
        if (err.name === 'ZodError') {
          return res.status(400).render('admin/create-customer', adminLocals(req, {
            title: 'Create customer',
            path: '/admin/customers',
            error: (err.issues || []).map((i) => i.message).join('; '),
            success: null,
            values: {
              email: req.body.email,
              firstName: req.body.firstName,
              lastName: req.body.lastName,
              phoneE164: req.body.phoneE164
            }
          }));
        }
        next(err);
      }
    }
  );

  // ---- KYC queue ----
  async function renderKycQueue(req, res, next) {
    try {
      const queue = await adminRepo.listPendingKyc();
      res.render('admin/kyc-queue', adminLocals(req, {
        title: 'KYC review',
        path: '/admin/kyc',
        queue: queue || [],
        message: req.query.msg || null,
        error: req.query.err || null
      }));
    } catch (err) {
      next(err);
    }
  }

  const kycStaff = requireRole('admin', 'kyc_reviewer');
  router.get('/admin/kyc', kycStaff, renderKycQueue);
  router.get('/admin/kyc/', kycStaff, renderKycQueue);

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
        if (opened.mode === 'redirect') return res.redirect(opened.url);
        res.setHeader('Content-Type', opened.contentType);
        res.setHeader('Content-Disposition', `inline; filename="${opened.filename}"`);
        opened.stream.on('error', next);
        opened.stream.pipe(res);
      } catch (err) {
        next(err);
      }
    }
  );

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
        res.render('admin/kyc-review', adminLocals(req, {
          title: 'Review document',
          path: '/admin/kyc',
          doc,
          error: null
        }));
      } catch (err) {
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
          return res.redirect(`/admin/kyc?err=${encodeURIComponent('Invalid document id.')}`);
        }
        const decision = String(req.body.decision || '').toLowerCase();
        if (decision !== 'approved' && decision !== 'rejected') {
          return res.redirect(`/admin/kyc?err=${encodeURIComponent('Choose Approve or Reject.')}`);
        }
        if (decision === 'rejected' && !(req.body.reason || '').trim()) {
          const doc = await customerRepo.getKycDocumentById(req.params.id);
          return res.status(400).render('admin/kyc-review', adminLocals(req, {
            title: 'Review document',
            path: '/admin/kyc',
            doc,
            error: 'A reason is required when rejecting a document.'
          }));
        }
        await adminRepo.reviewKyc({
          documentId: req.params.id,
          reviewerUserId: req.session.user.id,
          status: decision,
          reason: req.body.reason || null
        });
        const redirectTo = req.body.returnTo === 'dashboard' ? '/admin' : '/admin/kyc';
        const msg = decision === 'approved' ? 'Document approved.' : 'Document rejected.';
        return res.redirect(`${redirectTo}?msg=${encodeURIComponent(msg)}`);
      } catch (err) {
        if (err.status === 400 || err.status === 409) {
          return res.redirect(`/admin/kyc?err=${encodeURIComponent(err.message)}`);
        }
        return next(err);
      }
    }
  );

  return router;
}

module.exports = { createAdminRouter };