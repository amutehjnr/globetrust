'use strict';

const express = require('express');
const crypto = require('node:crypto');
const { requireAuth, requireRole, requireMfaEnrolled } = require('../../middleware/authz');
const { requireCsrf } = require('../../middleware/csrf');
const { banksForCountry, resolveCountryCode } = require('../../utils/banksByCountry');
const { COUNTRIES } = require('../../utils/countries');

function createTransferRouter({ transferService, transferRepo, coreBanking, mfaService, customerRepo }) {
  const router = express.Router();

  router.use('/app', requireAuth, requireRole('customer', 'admin', 'operations'));

  async function resolveCountryAndBanks(userId, overrideCountry, sessionUser) {
    let profile = null;
    let profileCountry = null;
    try {
      if (customerRepo?.getProfile) {
        profile = await customerRepo.getProfile(userId);
        profileCountry = profile?.countryCode || null;
      }
    } catch (err) {
      console.error('[GLOBE_TRANSFER] getProfile failed', err?.message || err);
    }
    // Direct column read if profile object missing country
    if (!profileCountry && customerRepo?.getCountryCode) {
      try {
        profileCountry = await customerRepo.getCountryCode(userId);
      } catch (err) {
        console.error('[GLOBE_TRANSFER] getCountryCode failed', err?.message || err);
      }
    }
    const sessionCountry = sessionUser?.countryCode || null;

    // Priority: query override → DB profile → session → env
    const effectiveCountry =
      resolveCountryCode(overrideCountry) ||
      resolveCountryCode(profileCountry) ||
      resolveCountryCode(sessionCountry) ||
      resolveCountryCode(process.env.DEFAULT_COUNTRY_CODE) ||
      null;

    let banks = [];
    try {
      banks = banksForCountry(effectiveCountry) || [];
    } catch (err) {
      console.error('[GLOBE_TRANSFER] banksForCountry failed', err?.message || err);
      banks = [];
    }
    if (!banks.length) {
      banks = [
        { code: 'LOCAL_BANK', name: 'Local bank (other)' },
        { code: 'INTERNATIONAL', name: 'International / correspondent bank' }
      ];
    }
    console.log('[GLOBE_TRANSFER] banks', JSON.stringify({
      userId,
      profileCountry,
      sessionCountry,
      overrideCountry: overrideCountry || null,
      effectiveCountry,
      bankCount: banks.length,
      sample: banks.slice(0, 3).map((b) => b.name)
    }));
    return { countryCode: effectiveCountry, profileCountry, profile, banks };
  }

  async function transferPageLocals(req, extra = {}) {
    const userId = req.session.user.id;
    await transferRepo.ensureSandboxLink(userId, 'NGN');
    const links = await transferRepo.listLinksWithExternal(userId);
    const history = await transferRepo.listForUser(userId);
    const override = req.query?.country || null;
    const { countryCode, profileCountry, profile, banks } = await resolveCountryAndBanks(userId, override, req.session.user);
    return {
      title: 'Transfers',
      path: '/app/transfers',
      links: links.filter((l) => l.linkStatus === 'active'),
      history,
      banks,
      countryCode,
      profileCountry,
      profile,
      countries: COUNTRIES,
      displayName: (req.session.user.email || 'customer').split('@')[0],
      initials: (req.session.user.email || 'CU').slice(0, 2).toUpperCase(),
      ...extra
    };
  }

  router.get('/app/accounts', async (req, res, next) => {
    try {
      await transferRepo.ensureSandboxLink(req.session.user.id, 'NGN');
      await transferRepo.ensureSandboxLink(req.session.user.id, 'USD');
      const links = await transferRepo.listLinksWithExternal(req.session.user.id);
      const withBalances = await transferService.getBalancesForLinks(links);
      res.render('customer/accounts', {
        title: 'Accounts',
        path: '/app/accounts',
        accounts: withBalances
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/app/transfers/banks', async (req, res, next) => {
    try {
      const { countryCode, profileCountry, banks } = await resolveCountryAndBanks(req.session.user.id, req.query?.country, req.session.user);
      res.json({ countryCode, profileCountry, banks, count: banks.length });
    } catch (err) {
      next(err);
    }
  });

  router.get('/app/transfers', requireMfaEnrolled(mfaService), async (req, res, next) => {
    try {
      const locals = await transferPageLocals(req, {
        idempotencyKey: crypto.randomBytes(16).toString('hex'),
        error: null,
        success: null,
        formValues: {}
      });
      res.render('customer/transfers', locals);
    } catch (err) {
      next(err);
    }
  });

  router.post('/app/transfers', requireCsrf, requireMfaEnrolled(mfaService), async (req, res, next) => {
    try {
      const result = await transferService.createTransfer({
        userId: req.session.user.id,
        sourceAccountLinkId: req.body.sourceAccountLinkId,
        amount: req.body.amount,
        destinationAccountRef: req.body.destinationAccountRef,
        destinationBankCode: req.body.destinationBankCode || undefined,
        destinationCurrency: req.body.destinationCurrency || undefined,
        narrative: req.body.narrative || undefined,
        idempotencyKey: req.body.idempotencyKey
      });
      const locals = await transferPageLocals(req, {
        idempotencyKey: crypto.randomBytes(16).toString('hex'),
        error: null,
        success: result.replay
          ? `This transfer was already submitted. Status: ${result.request.status}.`
          : (() => {
              const bank = req.body.destinationBankCode
                ? String(req.body.destinationBankCode).replace(/_/g, ' ')
                : null;
              const ref = result.request.externalReference || result.request.id || '—';
              const status = result.request.status || 'submitted';
              if (status === 'submitted' || status === 'pending_approval') {
                return bank
                  ? `Transfer received for processing to ${bank}. Reference: ${ref}. Our team will complete it shortly.`
                  : `Transfer received for processing. Reference: ${ref}. Our team will complete it shortly.`;
              }
              return bank
                ? `Transfer ${status} to ${bank}. Reference: ${ref}.`
                : `Transfer ${status}. Reference: ${ref}.`;
            })(),
        formValues: {}
      });
      res.render('customer/transfers', locals);
    } catch (err) {
      if (err.status === 400) {
        const locals = await transferPageLocals(req, {
          idempotencyKey: req.body.idempotencyKey || crypto.randomBytes(16).toString('hex'),
          error: err.message,
          success: null,
          formValues: {
            sourceAccountLinkId: req.body.sourceAccountLinkId,
            amount: req.body.amount,
            destinationBankCode: req.body.destinationBankCode,
            destinationAccountRef: req.body.destinationAccountRef,
            narrative: req.body.narrative
          }
        });
        return res.status(400).render('customer/transfers', locals);
      }
      next(err);
    }
  });

  // Webhook intake (no session — signature verified)
  router.post(
    '/webhooks/core-banking',
    async (req, res) => {
      try {
        const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
        const signature = req.get('x-sandbox-signature') || '';
        const secret = process.env.CORE_BANKING_WEBHOOK_SECRET || '';
        const valid = coreBanking.verifyWebhookSignature(raw, signature, secret);
        const payload = JSON.parse(raw.toString('utf8') || '{}');
        const eventId = String(payload.eventId || payload.id || crypto.randomBytes(8).toString('hex'));
        const payloadHash = crypto.createHash('sha256').update(raw).digest('hex');

        const recorded = await transferRepo.recordWebhook({
          providerCode: coreBanking.code,
          eventId,
          payloadHash,
          signatureValid: valid
        });

        if (recorded.duplicate) {
          return res.status(200).json({ ok: true, duplicate: true });
        }
        if (!valid) {
          await transferRepo.markWebhookProcessed(coreBanking.code, eventId, 'ignored');
          return res.status(401).json({ ok: false, error: 'invalid_signature' });
        }

        // Sandbox: acknowledge only — reconciliation jobs would update requests by provider ref
        await transferRepo.markWebhookProcessed(coreBanking.code, eventId, 'processed');
        return res.status(200).json({ ok: true });
      } catch (err) {
        return res.status(400).json({ ok: false, error: 'bad_webhook' });
      }
    }
  );

  return router;
}

module.exports = { createTransferRouter };