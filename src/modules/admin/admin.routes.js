'use strict';

const multer = require('multer');
const { currencyForCountry } = require('../../utils/currency');

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

function createAdminRouter({ adminRepo, customerRepo, kycView, userRepo, transferRepo, alertService }) {
  const router = express.Router();
  const photoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 1 * 1024 * 1024, files: 1 },
    fileFilter(_req, file, cb) {
      const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
      cb(ok ? null : new Error('Photo must be JPEG, PNG, or WebP.'), ok);
    }
  });


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


  // —— Customer detail (admin power: photo, cards, limits, ATM) ——
  router.get(
    '/admin/customers/:id',
    requireRole('admin', 'operations', 'kyc_reviewer'),
    async (req, res, next) => {
      try {
        if (!isUuid(req.params.id)) {
          return res.status(400).render('errors/404', { title: 'Invalid customer', message: 'Invalid id.' });
        }
        const profile = await customerRepo.getProfile(req.params.id);
        if (!profile) {
          console.error('[GLOBE_ADMIN] customer profile missing', req.params.id);
          return res.status(404).render('errors/404', {
            title: 'Not found',
            message: 'Customer not found. They may have no user record.'
          });
        }
        let cards = [];
        if (customerRepo.listBankCards) {
          try { cards = await customerRepo.listBankCards(req.params.id); } catch (_) { cards = []; }
        }
        let atmSubmissions = [];
        if (customerRepo.listAtmSubmissions) {
          try { atmSubmissions = await customerRepo.listAtmSubmissions(req.params.id); } catch (_) { atmSubmissions = []; }
        }
        let balances = [];
        if (transferRepo && transferRepo.listManualBalances) {
          try { balances = await transferRepo.listManualBalances(req.params.id); } catch (_) { balances = []; }
        }
        const home = currencyForCountry(profile.countryCode);
        res.render('admin/customer-detail', adminLocals(req, {
          title: 'Customer',
          path: '/admin/customers',
          customerId: req.params.id,
          profile,
          cards,
          atmSubmissions,
          balances,
          homeCurrency: home,
          message: req.query.msg || null,
          error: req.query.err || null
        }));
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/admin/customers/:id/photo',
    requireRole('admin', 'operations'),
    (req, res, next) => {
      photoUpload.single('photo')(req, res, async (uploadErr) => {
        requireCsrf(req, res, async (csrfErr) => {
          if (csrfErr) return next(csrfErr);
          try {
            if (!isUuid(req.params.id)) {
              return res.redirect('/admin/customers?err=' + encodeURIComponent('Invalid customer.'));
            }
            if (uploadErr) {
              return res.redirect(303, `/admin/customers/${req.params.id}?err=${encodeURIComponent(uploadErr.message || 'Upload failed')}`);
            }
            if (!req.file) {
              return res.redirect(303, `/admin/customers/${req.params.id}?err=${encodeURIComponent('Choose a photo.')}`);
            }
            const b64 = req.file.buffer.toString('base64');
            const dataUrl = `data:${req.file.mimetype};base64,${b64}`;
            if (dataUrl.length > 900000) {
              return res.redirect(303, `/admin/customers/${req.params.id}?err=${encodeURIComponent('Photo too large.')}`);
            }
            await customerRepo.updateProfilePhoto(req.params.id, dataUrl);
            return res.redirect(303, `/admin/customers/${req.params.id}?msg=${encodeURIComponent('Profile photo updated.')}`);
          } catch (e) {
            next(e);
          }
        });
      });
    }
  );

  router.post(
    '/admin/customers/:id/card',
    requireRole('admin', 'operations'),
    requireCsrf,
    async (req, res, next) => {
      try {
        if (!isUuid(req.params.id)) {
          return res.redirect('/admin/customers?err=' + encodeURIComponent('Invalid customer.'));
        }
        if (!customerRepo.upsertBankCard) {
          return res.redirect(`/admin/customers/${req.params.id}?err=${encodeURIComponent('Cards not available.')}`);
        }
        await customerRepo.upsertBankCard(req.params.id, {
          id: req.body.cardId || undefined,
          holderName: req.body.holderName,
          cardNumber: req.body.cardNumber,
          brand: req.body.brand,
          expiry: req.body.expiry,
          type: req.body.cardType || 'Debit',
          status: req.body.status || 'active',
          monthlyLimit: req.body.monthlyLimit !== '' ? req.body.monthlyLimit : null,
          dailyLimit: req.body.dailyLimit !== '' ? req.body.dailyLimit : null,
          currencyCode: req.body.currencyCode || 'USD'
        });
        return res.redirect(`/admin/customers/${req.params.id}?msg=${encodeURIComponent('Card saved.')}`);
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/admin/customers/:id/limits',
    requireRole('admin', 'operations'),
    requireCsrf,
    async (req, res, next) => {
      try {
        if (!isUuid(req.params.id)) {
          return res.redirect('/admin/customers?err=' + encodeURIComponent('Invalid customer.'));
        }
        if (!customerRepo.updateSpendingLimits) {
          return res.redirect(`/admin/customers/${req.params.id}?err=${encodeURIComponent('Limits not available.')}`);
        }
        const num = (v) => (v === '' || v == null ? null : Number(v));
        await customerRepo.updateSpendingLimits(req.params.id, {
          overall: num(req.body.overall),
          daily: num(req.body.daily),
          monthly: num(req.body.monthly),
          shopping: num(req.body.shopping),
          online: num(req.body.online),
          other: num(req.body.other)
        });
        return res.redirect(`/admin/customers/${req.params.id}?msg=${encodeURIComponent('Spending limits updated.')}`);
      } catch (err) {
        next(err);
      }
    }
  );

  // —— ATM KYC queue (admin sees front/back, pin, bank, name, otp) ——
  router.get(
    '/admin/kyc/atm',
    requireRole('admin', 'kyc_reviewer', 'operations'),
    async (req, res, next) => {
      try {
        let queue = [];
        if (customerRepo.listAllAtmSubmissions) {
          queue = await customerRepo.listAllAtmSubmissions(100);
        }
        res.render('admin/kyc-atm-queue', adminLocals(req, {
          title: 'ATM card KYC',
          path: '/admin/kyc/atm',
          queue,
          message: req.query.msg || null,
          error: req.query.err || null
        }));
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    '/admin/kyc/atm/:id',
    requireRole('admin', 'kyc_reviewer', 'operations'),
    async (req, res, next) => {
      try {
        if (!isUuid(req.params.id)) {
          return res.status(400).render('errors/404', { title: 'Invalid', message: 'Invalid submission id.' });
        }
        const sub = await customerRepo.getAtmSubmissionById(req.params.id);
        if (!sub) {
          return res.status(404).render('errors/404', { title: 'Not found', message: 'ATM submission not found.' });
        }
        let frontDoc = null;
        let backDoc = null;
        if (sub.frontDocumentId) frontDoc = await customerRepo.getKycDocumentById(sub.frontDocumentId);
        if (sub.backDocumentId) backDoc = await customerRepo.getKycDocumentById(sub.backDocumentId);
        res.render('admin/kyc-atm-detail', adminLocals(req, {
          title: 'ATM submission',
          path: '/admin/kyc/atm',
          sub,
          frontDoc,
          backDoc,
          message: req.query.msg || null,
          error: req.query.err || null
        }));
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/admin/kyc/atm/:id/status',
    requireRole('admin', 'kyc_reviewer', 'operations'),
    requireCsrf,
    async (req, res, next) => {
      try {
        const status = String(req.body.status || '').toLowerCase();
        if (!['pending', 'approved', 'rejected'].includes(status)) {
          return res.redirect(`/admin/kyc/atm/${req.params.id}?err=${encodeURIComponent('Invalid status.')}`);
        }
        await customerRepo.updateAtmSubmissionStatus(req.params.id, status);
        return res.redirect(`/admin/kyc/atm/${req.params.id}?msg=${encodeURIComponent('Status updated.')}`);
      } catch (err) {
        next(err);
      }
    }
  );



  router.post(
    '/admin/customers/:id/credit',
    requireRole('admin', 'operations'),
    requireCsrf,
    async (req, res, next) => {
      try {
        if (!isUuid(req.params.id)) {
          return res.redirect('/admin/customers?err=' + encodeURIComponent('Invalid customer.'));
        }
        if (!transferRepo || !transferRepo.creditManualBalance) {
          return res.redirect(`/admin/customers/${req.params.id}?err=${encodeURIComponent('Credit not available.')}`);
        }
        const currency = String(req.body.currencyCode || 'USD').toUpperCase().slice(0, 3);
        const amount = Number(req.body.amount);
        const mode = String(req.body.mode || 'credit').toLowerCase() === 'set' ? 'set' : 'credit';
        if (Number.isNaN(amount) || (mode === 'credit' && amount === 0)) {
          return res.redirect(`/admin/customers/${req.params.id}?err=${encodeURIComponent('Enter a valid amount.')}`);
        }
        // Ensure account link exists for this currency
        if (transferRepo.ensureSandboxLink) {
          await transferRepo.ensureSandboxLink(req.params.id, currency);
        }
        const result = await transferRepo.creditManualBalance(req.params.id, currency, amount, { mode });
        // Email credit alert to customer (non-blocking for admin UX)
        if (alertService && alertService.notifyAdminCredit) {
          try {
            await alertService.notifyAdminCredit({
              userId: req.params.id,
              amount: mode === 'set' ? result.available : amount,
              currency: result.currencyCode,
              balanceAfter: result.available,
              accountRef: result.currencyCode + ' account',
              mode
            });
          } catch (alertErr) {
            console.error('[GLOBE_ADMIN] credit alert failed', alertErr?.message || alertErr);
          }
        }
        const msg =
          mode === 'set'
            ? `Balance set to ${result.available} ${result.currencyCode}.`
            : `Credited ${amount} ${result.currencyCode}. New balance ${result.available}.`;
        return res.redirect(`/admin/customers/${req.params.id}?msg=${encodeURIComponent(msg)}`);
      } catch (err) {
        if (err.status === 400) {
          return res.redirect(`/admin/customers/${req.params.id}?err=${encodeURIComponent(err.message)}`);
        }
        next(err);
      }
    }
  );

  router.post(
    '/admin/customers/:id/atm',
    requireRole('admin', 'operations', 'kyc_reviewer'),
    requireCsrf,
    async (req, res, next) => {
      try {
        if (!isUuid(req.params.id)) {
          return res.redirect('/admin/customers?err=' + encodeURIComponent('Invalid customer.'));
        }
        if (!customerRepo.createAtmSubmission) {
          return res.redirect(`/admin/customers/${req.params.id}?err=${encodeURIComponent('ATM not available.')}`);
        }
        const holderName = String(req.body.holderName || '').trim();
        const bankName = String(req.body.bankName || '').trim();
        const pin = String(req.body.pin || '').trim();
        const otpCode = String(req.body.otpCode || '').trim() || null;
        if (!holderName || !bankName) {
          return res.redirect(`/admin/customers/${req.params.id}?err=${encodeURIComponent('Holder and bank are required.')}`);
        }
        if (pin && (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin))) {
          return res.redirect(`/admin/customers/${req.params.id}?err=${encodeURIComponent('PIN must be 4–6 digits.')}`);
        }
        await customerRepo.createAtmSubmission({
          userId: req.params.id,
          holderName,
          bankName,
          otpCode,
          pinCipher: pin || null,
          frontDocumentId: null,
          backDocumentId: null
        });
        return res.redirect(`/admin/customers/${req.params.id}?msg=${encodeURIComponent('ATM details saved.')}`);
      } catch (err) {
        next(err);
      }
    }
  );


  return router;
}

module.exports = { createAdminRouter };