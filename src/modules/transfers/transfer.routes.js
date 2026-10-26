'use strict';

const express = require('express');
const crypto = require('node:crypto');
const { requireAuth, requireRole, requireMfaEnrolled } = require('../../middleware/authz');
const { requireCsrf } = require('../../middleware/csrf');
const { banksForCountry, resolveCountryCode } = require('../../utils/banksByCountry');
const { enrichBanks, flagUrlForCountry } = require('../../utils/bankLogos');
const { COUNTRIES } = require('../../utils/countries');

function createTransferRouter({ transferService, transferRepo, coreBanking, mfaService, customerRepo }) {
  const router = express.Router();

  router.use('/app', requireAuth, requireRole('customer', 'admin', 'operations'));

  async function resolveCountryAndBanks(userId, overrideCountry, sessionUser) {
    console.error('[GLOBE_TRANSFER] resolveCountryAndBanks:start', JSON.stringify({
      userId,
      overrideCountry: overrideCountry || null,
      sessionCountry: sessionUser?.countryCode || null,
      sessionEmail: sessionUser?.email || null,
      hasCustomerRepo: Boolean(customerRepo),
      hasGetProfile: Boolean(customerRepo?.getProfile),
      hasGetCountryCode: Boolean(customerRepo?.getCountryCode)
    }));

    let profile = null;
    let profileCountry = null;
    try {
      if (customerRepo?.getProfile) {
        profile = await customerRepo.getProfile(userId);
        profileCountry = profile?.countryCode || null;
        console.error('[GLOBE_TRANSFER] getProfile:ok', JSON.stringify({
          userId,
          hasProfile: Boolean(profile),
          countryCode: profileCountry,
          firstName: profile?.firstName || null,
          keys: profile ? Object.keys(profile) : []
        }));
      } else {
        console.error('[GLOBE_TRANSFER] getProfile:missing customerRepo.getProfile');
      }
    } catch (err) {
      console.error('[GLOBE_TRANSFER] getProfile:error', err?.message || err);
      if (err?.stack) console.error(err.stack);
    }

    if (!profileCountry && customerRepo?.getCountryCode) {
      try {
        profileCountry = await customerRepo.getCountryCode(userId);
        console.error('[GLOBE_TRANSFER] getCountryCode:ok', JSON.stringify({ userId, profileCountry }));
      } catch (err) {
        console.error('[GLOBE_TRANSFER] getCountryCode:error', err?.message || err);
        if (err?.stack) console.error(err.stack);
      }
    }

    const sessionCountry = sessionUser?.countryCode || null;
    const resolvedOverride = resolveCountryCode(overrideCountry);
    const resolvedProfile = resolveCountryCode(profileCountry);
    const resolvedSession = resolveCountryCode(sessionCountry);
    const resolvedEnv = resolveCountryCode(process.env.DEFAULT_COUNTRY_CODE);

    const effectiveCountry =
      resolvedOverride || resolvedProfile || resolvedSession || resolvedEnv || null;

    console.error('[GLOBE_TRANSFER] country:resolved', JSON.stringify({
      rawProfileCountry: profileCountry,
      rawSessionCountry: sessionCountry,
      rawOverride: overrideCountry || null,
      resolvedOverride,
      resolvedProfile,
      resolvedSession,
      resolvedEnv,
      effectiveCountry
    }));

    let banks = [];
    try {
      banks = banksForCountry(effectiveCountry) || [];
      console.error('[GLOBE_TRANSFER] banksForCountry:ok', JSON.stringify({
        effectiveCountry,
        bankCount: banks.length,
        sample: banks.slice(0, 5).map((b) => ({ code: b.code, name: b.name }))
      }));
    } catch (err) {
      console.error('[GLOBE_TRANSFER] banksForCountry:error', err?.message || err);
      if (err?.stack) console.error(err.stack);
      banks = [];
    }

    if (!banks.length) {
      console.error('[GLOBE_TRANSFER] banks:empty — using generic fallback');
      banks = [
        { code: 'LOCAL_BANK', name: 'Local bank (other)' },
        { code: 'INTERNATIONAL', name: 'International / correspondent bank' }
      ];
    }

    banks = enrichBanks(banks, effectiveCountry);
    return {
      countryCode: effectiveCountry,
      profileCountry,
      profile,
      banks,
      countryFlagUrl: flagUrlForCountry(effectiveCountry, 80)
    };
  }

  async function transferPageLocals(req, extra = {}) {
    const userId = req.session.user.id;
    await transferRepo.ensureSandboxLink(userId, 'NGN');
    const links = await transferRepo.listLinksWithExternal(userId);
    const history = await transferRepo.listForUser(userId);
    const override = req.query?.country || null;
    const resolved = await resolveCountryAndBanks(userId, override, req.session.user);
    const { countryCode, profileCountry, profile, banks, countryFlagUrl } = resolved;
    return {
      title: 'Transfers',
      path: '/app/transfers',
      links: links.filter((l) => l.linkStatus === 'active'),
      history,
      banks,
      countryCode,
      countryFlagUrl: countryFlagUrl || null,
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
      console.error('[GLOBE_TRANSFER] GET /app/transfers/banks', JSON.stringify({
        userId: req.session?.user?.id,
        queryCountry: req.query?.country || null
      }));
      const resolved = await resolveCountryAndBanks(
        req.session.user.id,
        req.query?.country,
        req.session.user
      );
      const { countryCode, profileCountry, banks, countryFlagUrl } = resolved;
      const payload = { countryCode, profileCountry, banks, countryFlagUrl, count: banks.length };
      console.error('[GLOBE_TRANSFER] banks API response', JSON.stringify({
        countryCode,
        profileCountry,
        count: banks.length,
        sample: banks.slice(0, 3).map((b) => b.name)
      }));
      res.json(payload);
    } catch (err) {
      console.error('[GLOBE_TRANSFER] banks API error', err?.message || err);
      if (err?.stack) console.error(err.stack);
      next(err);
    }
  });

  router.get('/app/transfers', requireMfaEnrolled(mfaService), async (req, res, next) => {
    try {
      console.error('[GLOBE_TRANSFER] GET /app/transfers', JSON.stringify({
        userId: req.session?.user?.id,
        email: req.session?.user?.email,
        roles: req.session?.user?.roles,
        sessionCountry: req.session?.user?.countryCode || null,
        query: req.query || {}
      }));
      const locals = await transferPageLocals(req, {
        idempotencyKey: crypto.randomBytes(16).toString('hex'),
        error: null,
        success: null,
        formValues: {}
      });
      console.error('[GLOBE_TRANSFER] render locals', JSON.stringify({
        countryCode: locals.countryCode,
        profileCountry: locals.profileCountry,
        bankCount: Array.isArray(locals.banks) ? locals.banks.length : null,
        linkCount: Array.isArray(locals.links) ? locals.links.length : null
      }));
      res.render('customer/transfers', locals);
    } catch (err) {
      console.error('[GLOBE_TRANSFER] GET /app/transfers failed', err?.message || err);
      if (err?.stack) console.error(err.stack);
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