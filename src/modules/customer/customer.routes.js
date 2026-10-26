'use strict';

const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const { requireAuth, requireRole } = require('../../middleware/authz');
const { requireCsrf } = require('../../middleware/csrf');
const { COUNTRIES, normalizeCountryCode } = require('../../utils/countries');
const { getTopMarketRates } = require('../../services/fxService');
const { banksForCountry, resolveCountryCode } = require('../../utils/banksByCountry');
const { enrichBanks, flagUrlForCountry } = require('../../utils/bankLogos');
const crypto = require('node:crypto');

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
        countries: COUNTRIES,
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
      if (req.session.user && data.countryCode !== undefined) {
        req.session.user.countryCode = data.countryCode || null;
      }
      const profile = await customerRepo.getProfile(req.session.user.id);
      res.render('customer/profile', {
        title: 'Profile',
        path: '/app/profile',
        profile,
        countries: COUNTRIES,
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
          countries: COUNTRIES,
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
      path: extra.path || req.path || '',
      profile: null,
      cards: [],
      beneficiaries: [],
      history: [],
      rates: [],
      accounts: [],
      mfaStatus: { enrolled: false, required: true },
      error: null,
      success: null,
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

  router.get('/app/cards', async (req, res, next) => {
    try {
      let profile = null;
      try {
        profile = await customerRepo.getProfile(req.session.user.id);
      } catch (_) {}
      res.render('customer/cards', pageLocals(req, {
        title: 'Cards',
        path: '/app/cards',
        profile,
        cards: []
      }));
    } catch (err) {
      next(err);
    }
  });

  router.get('/app/beneficiaries', async (req, res, next) => {
    try {
      let profile = null;
      try {
        profile = await customerRepo.getProfile(req.session.user.id);
      } catch (_) {}
      res.render('customer/beneficiaries', pageLocals(req, {
        title: 'Beneficiaries',
        path: '/app/beneficiaries',
        profile,
        beneficiaries: []
      }));
    } catch (err) {
      next(err);
    }
  });

  router.get('/app/statements', async (req, res, next) => {
    try {
      let history = [];
      let profile = null;
      try {
        profile = await customerRepo.getProfile(req.session.user.id);
      } catch (_) {}
      if (transferRepo) {
        history = await transferRepo.listForUser(req.session.user.id, 50);
      }
      res.render('customer/statements', pageLocals(req, {
        title: 'Statements',
        path: '/app/statements',
        profile,
        history: history || []
      }));
    } catch (err) {
      next(err);
    }
  });

  router.get('/app/exchange', async (req, res, next) => {
    try {
      let profile = null;
      try {
        profile = await customerRepo.getProfile(req.session.user.id);
      } catch (_) {}

      let rates = [];
      let ratesAsOf = null;
      let ratesSource = null;
      let ratesError = null;
      try {
        const fx = await getTopMarketRates();
        rates = fx.rates || [];
        ratesAsOf = fx.asOf;
        ratesSource = fx.source;
      } catch (fxErr) {
        console.error('[GLOBE_FX] live rates failed', fxErr?.message || fxErr);
        ratesError = 'Live market rates are temporarily unavailable. Please try again shortly.';
      }

      res.render('customer/exchange', pageLocals(req, {
        title: 'Exchange rates',
        path: '/app/exchange',
        profile,
        rates,
        ratesAsOf,
        ratesSource,
        ratesError
      }));
    } catch (err) {
      next(err);
    }
  });


  async function resolveDepositBanks(userId, sessionUser) {
    let profile = null;
    let profileCountry = null;
    try {
      profile = await customerRepo.getProfile(userId);
      profileCountry = profile?.countryCode || null;
    } catch (_) {}
    if (!profileCountry && customerRepo.getCountryCode) {
      try {
        profileCountry = await customerRepo.getCountryCode(userId);
      } catch (_) {}
    }
    const sessionCountry = sessionUser?.countryCode || null;
    const countryCode =
      resolveCountryCode(profileCountry) ||
      resolveCountryCode(sessionCountry) ||
      null;
    let banks = enrichBanks(banksForCountry(countryCode), countryCode);
    return {
      profile,
      countryCode,
      countryFlagUrl: flagUrlForCountry(countryCode, 80),
      banks
    };
  }

  router.get('/app/deposit', async (req, res, next) => {
    try {
      const userId = req.session.user.id;
      let accounts = [];
      if (transferRepo && transferService) {
        await transferRepo.ensureSandboxLink(userId, 'NGN');
        await transferRepo.ensureSandboxLink(userId, 'USD');
        const links = await transferRepo.listLinksWithExternal(userId);
        accounts = await transferService.getBalancesForLinks(links);
      }
      const { profile, countryCode, countryFlagUrl, banks } = await resolveDepositBanks(
        userId,
        req.session.user
      );
      res.render('customer/deposit', pageLocals(req, {
        title: 'Deposit',
        path: '/app/deposit',
        profile,
        accounts: (accounts || []).filter((a) => a.linkStatus !== 'inactive'),
        banks,
        countryCode,
        countryFlagUrl,
        formValues: {},
        error: null,
        success: null
      }));
    } catch (err) {
      next(err);
    }
  });

  router.post('/app/deposit', requireCsrf, async (req, res, next) => {
    try {
      const userId = req.session.user.id;
      const amount = Number(String(req.body.amount || '').replace(/,/g, ''));
      const sourceBankCode = String(req.body.sourceBankCode || '').trim();
      const sourceAccountNumber = String(req.body.sourceAccountNumber || '').trim();
      const destinationAccountLinkId = String(req.body.destinationAccountLinkId || '').trim();
      const narrative = String(req.body.narrative || '').trim().slice(0, 140);

      const { profile, countryCode, countryFlagUrl, banks } = await resolveDepositBanks(
        userId,
        req.session.user
      );

      let accounts = [];
      if (transferRepo && transferService) {
        const links = await transferRepo.listLinksWithExternal(userId);
        accounts = await transferService.getBalancesForLinks(links);
      }

      const formValues = {
        amount: req.body.amount,
        sourceBankCode,
        sourceAccountNumber,
        destinationAccountLinkId,
        narrative
      };

      const renderForm = (error, success = null) =>
        res.status(error ? 400 : 200).render('customer/deposit', pageLocals(req, {
          title: 'Deposit',
          path: '/app/deposit',
          profile,
          accounts,
          banks,
          countryCode,
          countryFlagUrl,
          formValues,
          error,
          success
        }));

      if (!(amount > 0) || Number.isNaN(amount)) {
        return renderForm('Enter a valid deposit amount.');
      }
      if (!sourceBankCode) {
        return renderForm('Select the bank you are depositing from.');
      }
      if (!sourceAccountNumber || sourceAccountNumber.length < 4) {
        return renderForm('Enter your account number at the source bank (min 4 characters).');
      }
      if (!destinationAccountLinkId) {
        return renderForm('Select the Globe Trust account to credit.');
      }

      const bankName =
        (banks || []).find((b) => b.code === sourceBankCode)?.name || sourceBankCode;
      const ref = `DEP-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

      // Manual processing — instruction accepted for ops to complete
      console.error('[GLOBE_DEPOSIT] submitted', JSON.stringify({
        userId,
        ref,
        amount,
        countryCode,
        sourceBankCode,
        bankName,
        destinationAccountLinkId,
        narrative: narrative || null
      }));

      return res.render('customer/deposit', pageLocals(req, {
        title: 'Deposit',
        path: '/app/deposit',
        profile,
        accounts,
        banks,
        countryCode,
        countryFlagUrl,
        formValues: {},
        error: null,
        success:
          `Deposit request received for processing. ` +
          `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ` +
          `from ${bankName}. Reference: ${ref}.`
      }));
    } catch (err) {
      next(err);
    }
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
        mfaStatus,
        countries: COUNTRIES,
        countryMessage: null,
        countryError: null
      }));
    } catch (err) { next(err); }
  });

  router.post('/app/settings/country', requireCsrf, async (req, res, next) => {
    try {
      const code = normalizeCountryCode(req.body.countryCode);
      if (!code && req.body.countryCode !== 'OTHER') {
        const profile = await customerRepo.getProfile(req.session.user.id);
        let mfaStatus = { enrolled: false, required: true };
        if (mfaService) mfaStatus = await mfaService.getStatus(req.session.user.id);
        return res.status(400).render('customer/settings', pageLocals(req, {
          title: 'Settings',
          path: '/app/settings',
          profile,
          mfaStatus,
          countries: COUNTRIES,
          countryMessage: null,
          countryError: 'Please select a valid country.'
        }));
      }
      // Persist country even when profile row was missing
      if (customerRepo.setCountryCode) {
        await customerRepo.setCountryCode(req.session.user.id, code);
      } else {
        const profile = await customerRepo.getProfile(req.session.user.id);
        await customerRepo.updateProfile(req.session.user.id, {
          firstName: profile?.firstName || 'Customer',
          lastName: profile?.lastName || 'User',
          middleName: profile?.middleName || '',
          countryCode: code || '',
          preferredLocale: profile?.preferredLocale || 'en'
        });
      }
      if (req.session.user) {
        req.session.user.countryCode = code || null;
      }
      console.error('[GLOBE_SETTINGS] country saved', JSON.stringify({
        userId: req.session.user.id,
        countryCode: code
      }));
      const updated = await customerRepo.getProfile(req.session.user.id);
      let mfaStatus = { enrolled: false, required: true };
      if (mfaService) mfaStatus = await mfaService.getStatus(req.session.user.id);
      return res.render('customer/settings', pageLocals(req, {
        title: 'Settings',
        path: '/app/settings',
        profile: updated,
        mfaStatus,
        countries: COUNTRIES,
        countryMessage: 'Country updated.',
        countryError: null
      }));
    } catch (err) {
      next(err);
    }
  });

  return router;
}


module.exports = { createCustomerRouter };