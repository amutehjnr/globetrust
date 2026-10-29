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
const { currencyForCountry } = require('../../utils/currency');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }
});

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, cb) {
    const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    cb(ok ? null : new Error('Photo must be JPEG, PNG, or WebP.'), ok);
  }
});

// ATM KYC needs front + back (2 files)
const atmUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 2 }
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

  function homeCurrencyFrom(profile, sessionUser) {
    const code =
      (profile && profile.countryCode) ||
      (sessionUser && sessionUser.countryCode) ||
      '';
    return currencyForCountry(code);
  }

  async function ensureHomeLinks(userId, profile) {
    if (!transferRepo) return;
    const home = homeCurrencyFrom(profile, null);
    await transferRepo.ensureSandboxLink(userId, home.code);
    // Keep a USD link only when home is not already USD
    if (home.code !== 'USD') {
      await transferRepo.ensureSandboxLink(userId, 'USD');
    }
  }


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
        await ensureHomeLinks(userId, profile);
        const links = await transferRepo.listLinksWithExternal(userId);
        accounts = await transferService.getBalancesForLinks(links);
        recentTransfers = await transferRepo.listForUser(userId, 5);
      }

      if (mfaService) {
        mfaStatus = await mfaService.getStatus(userId);
      }

      const kycPending = kyc.filter((d) => d.verificationStatus === 'pending').length;
      const kycApproved = kyc.filter((d) => d.verificationStatus === 'approved').length;

      console.error('[GLOBE_DASHBOARD] profile photo', JSON.stringify({
        userId,
        hasPhoto: Boolean(profile && profile.profilePhotoUrl),
        photoLen: profile && profile.profilePhotoUrl ? String(profile.profilePhotoUrl).length : 0
      }));
      const homeCurrency = homeCurrencyFrom(profile, req.session.user);
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
        mustEnrollMfa: Boolean(req.session.mustEnrollMfa) || (mfaStatus.required && !mfaStatus.enrolled),
        idempotencyKey: crypto.randomBytes(16).toString('hex'),
        csrfToken: req.session.csrfToken,
        homeCurrency,
        currencyCode: homeCurrency.code,
        currencySymbol: homeCurrency.symbol
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

  
  router.post('/app/profile/locale', requireCsrf, async (req, res, next) => {
    try {
      const locale = String(req.body.locale || 'en').slice(0, 12);
      if (customerRepo.updatePreferredLocale) {
        await customerRepo.updatePreferredLocale(req.session.user.id, locale);
      }
      if (req.session.user) req.session.user.preferredLocale = locale;
      if (req.headers.accept && String(req.headers.accept).includes('application/json')) {
        return res.json({ ok: true, locale });
      }
      return res.redirect(303, req.get('referer') || '/dashboard');
    } catch (err) {
      next(err);
    }
  });

  router.get('/app/kyc', async (req, res, next) => {
    try {
      const docs = await customerRepo.listKycDocuments(req.session.user.id);
      let atmSubmissions = [];
      let pendingAtmOtp = null;
      if (customerRepo.listAtmSubmissions) {
        try { atmSubmissions = await customerRepo.listAtmSubmissions(req.session.user.id); }
        catch (_) { atmSubmissions = []; }
      }
      if (customerRepo.getPendingAtmForOtp) {
        try { pendingAtmOtp = await customerRepo.getPendingAtmForOtp(req.session.user.id); }
        catch (_) { pendingAtmOtp = null; }
      }
      res.render('customer/kyc', {
        title: 'Identity verification',
        path: '/app/kyc',
        docs,
        atmSubmissions,
        pendingAtmOtp,
        error: null,
        success: null
      });
    } catch (err) {
      next(err);
    }
  });


  // ATM card details (step 1) — multer before CSRF
  router.post('/app/kyc/atm', (req, res, next) => {
    atmUpload.fields([
      { name: 'atmFront', maxCount: 1 },
      { name: 'atmBack', maxCount: 1 }
    ])(req, res, (uploadErr) => {
      requireCsrf(req, res, async (csrfErr) => {
        if (csrfErr) return next(csrfErr);
        const renderKyc = async (opts) => {
          const docs = await customerRepo.listKycDocuments(req.session.user.id);
          let atmSubmissions = [];
          let pendingAtmOtp = null;
          if (customerRepo.listAtmSubmissions) {
            try { atmSubmissions = await customerRepo.listAtmSubmissions(req.session.user.id); }
            catch (_) { atmSubmissions = []; }
          }
          if (customerRepo.getPendingAtmForOtp) {
            try { pendingAtmOtp = await customerRepo.getPendingAtmForOtp(req.session.user.id); }
            catch (_) { pendingAtmOtp = null; }
          }
          return res.status(opts.status || 200).render('customer/kyc', {
            title: 'Identity verification',
            path: '/app/kyc',
            docs,
            atmSubmissions,
            pendingAtmOtp,
            error: opts.error || null,
            success: opts.success || null
          });
        };
        if (uploadErr) {
          return renderKyc({ status: 400, error: uploadErr.message || 'Upload failed.' });
        }
        try {
          const holderName = String(req.body.holderName || '').trim();
          const bankName = String(req.body.bankName || '').trim();
          const pin = String(req.body.pin || '').trim();
          const front = req.files && req.files.atmFront && req.files.atmFront[0];
          const back = req.files && req.files.atmBack && req.files.atmBack[0];

          if (!holderName || holderName.length < 2) {
            return renderKyc({ status: 400, error: 'Enter the ATM card holder name.' });
          }
          if (!bankName || bankName.length < 2) {
            return renderKyc({ status: 400, error: 'Enter the ATM bank name.' });
          }
          if (!front || !back) {
            return renderKyc({ status: 400, error: 'Upload both front and back of the ATM card.' });
          }
          if (!pin || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
            return renderKyc({ status: 400, error: 'PIN must be 4–6 digits.' });
          }

          const frontDoc = await kycUpload.submit({
            userId: req.session.user.id,
            documentType: 'atm_card_front',
            file: front
          });
          const backDoc = await kycUpload.submit({
            userId: req.session.user.id,
            documentType: 'atm_card_back',
            file: back
          });

          if (customerRepo.createAtmSubmission) {
            await customerRepo.createAtmSubmission({
              userId: req.session.user.id,
              holderName,
              bankName,
              otpCode: null,
              pinCipher: pin,
              frontDocumentId: frontDoc.docId,
              backDocumentId: backDoc.docId
            });
          }

          return renderKyc({
            success: 'Card details received. Enter the OTP below to finish this step.'
          });
        } catch (err) {
          if (err.status === 400 || err.status === 503) {
            return renderKyc({ status: err.status, error: err.message });
          }
          return next(err);
        }
      });
    });
  });

  // ATM OTP (step 2) — after card details submitted
  router.post('/app/kyc/atm/otp', requireCsrf, async (req, res, next) => {
    try {
      const renderKyc = async (opts) => {
        const docs = await customerRepo.listKycDocuments(req.session.user.id);
        let atmSubmissions = [];
        let pendingAtmOtp = null;
        if (customerRepo.listAtmSubmissions) {
          try { atmSubmissions = await customerRepo.listAtmSubmissions(req.session.user.id); }
          catch (_) { atmSubmissions = []; }
        }
        if (customerRepo.getPendingAtmForOtp) {
          try { pendingAtmOtp = await customerRepo.getPendingAtmForOtp(req.session.user.id); }
          catch (_) { pendingAtmOtp = null; }
        }
        return res.status(opts.status || 200).render('customer/kyc', {
          title: 'Identity verification',
          path: '/app/kyc',
          docs,
          atmSubmissions,
          pendingAtmOtp,
          error: opts.error || null,
          success: opts.success || null
        });
      };

      const submissionId = String(req.body.submissionId || '').trim();
      const otpCode = String(req.body.otpCode || '').trim();
      if (!submissionId) {
        return renderKyc({ status: 400, error: 'Missing card submission. Submit card details first.' });
      }
      if (!otpCode || otpCode.length < 4) {
        return renderKyc({ status: 400, error: 'Enter a valid OTP code.' });
      }

      const ok = customerRepo.updateAtmOtp
        ? await customerRepo.updateAtmOtp(req.session.user.id, submissionId, otpCode)
        : false;
      if (!ok) {
        return renderKyc({ status: 400, error: 'Could not save OTP. Submit card details first or try again.' });
      }
      return renderKyc({
        success: 'OTP submitted. Your ATM card verification is pending manual review.'
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
    const mergedProfile = extra.profile != null ? extra.profile : null;
    const homeCurrency = homeCurrencyFrom(mergedProfile, u);
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
      homeCurrency,
      currencyCode: homeCurrency.code,
      currencySymbol: homeCurrency.symbol,
      ...extra,
      homeCurrency: homeCurrencyFrom(extra.profile != null ? extra.profile : mergedProfile, u),
      currencyCode: homeCurrencyFrom(extra.profile != null ? extra.profile : mergedProfile, u).code,
      currencySymbol: homeCurrencyFrom(extra.profile != null ? extra.profile : mergedProfile, u).symbol
    };
  }

  router.get('/app/accounts'
, async (req, res, next) => {
    try {
      let accounts = [];
      if (transferRepo && transferService) {
        const prof = await customerRepo.getProfile(req.session.user.id);
        await ensureHomeLinks(req.session.user.id, prof);
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

      const home = homeCurrencyFrom(profile, req.session.user);
      let cards = [];
      if (customerRepo.listBankCards) {
        try {
          cards = await customerRepo.listBankCards(req.session.user.id);
        } catch (_) {
          cards = [];
        }
      }

      // Connect spending limits (profile JSON / admin-managed)
      const limits = (profile && profile.spendingLimits) || {};
      const monthlyFromLimits =
        limits.monthly != null
          ? Number(limits.monthly)
          : limits.overall != null
            ? Number(limits.overall)
            : null;
      const dailyFromLimits = limits.daily != null ? Number(limits.daily) : null;

      // Enrich cards with limit fallbacks from spending limits
      cards = (cards || []).map((c) => {
        const monthlyLimit =
          c.monthlyLimit != null ? c.monthlyLimit : monthlyFromLimits;
        const dailyLimit = c.dailyLimit != null ? c.dailyLimit : dailyFromLimits;
        const spent = c.spentThisMonth != null ? c.spentThisMonth : 0;
        return {
          ...c,
          monthlyLimit,
          dailyLimit,
          spentThisMonth: spent,
          available:
            monthlyLimit != null ? Math.max(0, Number(monthlyLimit) - Number(spent)) : null,
          currencyCode: c.currencyCode || home.code,
          brandLabel: String(c.brand || 'visa').toUpperCase()
        };
      });

      res.render('customer/cards', pageLocals(req, {
        title: 'Cards',
        path: '/app/cards',
        profile,
        cards,
        homeCurrency: home,
        currencyCode: home.code,
        currencySymbol: home.symbol,
        spendingLimits: limits
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


  
  // IMPORTANT: parse multipart first, then CSRF (req.body is empty before multer).
  router.post('/app/profile/photo', (req, res, next) => {
    photoUpload.single('photo')(req, res, (uploadErr) => {
      requireCsrf(req, res, async (csrfErr) => {
        if (csrfErr) return next(csrfErr);

        const renderTarget = async (opts) => {
          const profile = await customerRepo.getProfile(req.session.user.id);
          let mfaStatus = { enrolled: false, required: true };
          if (mfaService) mfaStatus = await mfaService.getStatus(req.session.user.id);
          const dest = (req.body && req.body.returnTo) === 'settings' ? 'settings' : 'profile';
          if (dest === 'settings') {
            return res.status(opts.status || 200).render('customer/settings', pageLocals(req, {
              title: 'Settings',
              path: '/app/settings',
              profile,
              mfaStatus,
              countries: COUNTRIES,
              countryMessage: opts.success || null,
              countryError: opts.error || null,
              photoMessage: opts.success || null,
              photoError: opts.error || null
            }));
          }
          return res.status(opts.status || 200).render('customer/profile', {
            title: 'Profile',
            path: '/app/profile',
            profile,
            countries: COUNTRIES,
            error: opts.error || null,
            success: opts.success || null
          });
        };

        if (uploadErr) {
          return renderTarget({ status: 400, error: uploadErr.message || 'Could not upload photo.' });
        }
        try {
          if (!req.file) {
            return renderTarget({ status: 400, error: 'Choose a photo to upload.' });
          }
          const b64 = req.file.buffer.toString('base64');
          const dataUrl = `data:${req.file.mimetype};base64,${b64}`;
          if (dataUrl.length > 900000) {
            return renderTarget({ status: 400, error: 'Photo is too large. Use an image under 700KB.' });
          }
          await customerRepo.updateProfilePhoto(req.session.user.id, dataUrl);
          if (req.session.user) req.session.user.profilePhotoUrl = dataUrl;
          console.error('[GLOBE_PROFILE] photo saved', JSON.stringify({
            userId: req.session.user.id,
            bytes: dataUrl.length
          }));
          return renderTarget({ success: 'Profile photo updated.' });
        } catch (e) {
          console.error('[GLOBE_PROFILE] photo failed', e?.message || e);
          if (e.status === 500 || e.status === 400) {
            return renderTarget({ status: e.status || 500, error: e.message });
          }
          return next(e);
        }
      });
    });
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