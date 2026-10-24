'use strict';

const express = require('express');
const crypto = require('node:crypto');
const { requireAuth, requireRole, requireMfaEnrolled } = require('../../middleware/authz');
const { requireCsrf } = require('../../middleware/csrf');

function createTransferRouter({ transferService, transferRepo, coreBanking, mfaService }) {
  const router = express.Router();

  router.use('/app', requireAuth, requireRole('customer', 'admin', 'operations'));

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

  router.get('/app/transfers', requireMfaEnrolled(mfaService), async (req, res, next) => {
    try {
      await transferRepo.ensureSandboxLink(req.session.user.id, 'NGN');
      const links = await transferRepo.listLinksWithExternal(req.session.user.id);
      const history = await transferRepo.listForUser(req.session.user.id);
      const idempotencyKey = crypto.randomBytes(16).toString('hex');
      res.render('customer/transfers', {
        title: 'Transfers',
        path: '/app/transfers',
        links: links.filter((l) => l.linkStatus === 'active'),
        history,
        idempotencyKey,
        error: null,
        success: null,
        displayName: (req.session.user.email || 'customer').split('@')[0],
        initials: (req.session.user.email || 'CU').slice(0, 2).toUpperCase(),
      });
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
        destinationCurrency: req.body.destinationCurrency || undefined,
        narrative: req.body.narrative || undefined,
        idempotencyKey: req.body.idempotencyKey
      });
      const links = await transferRepo.listLinksWithExternal(req.session.user.id);
      const history = await transferRepo.listForUser(req.session.user.id);
      res.render('customer/transfers', {
        title: 'Transfers',
        path: '/app/transfers',
        links: links.filter((l) => l.linkStatus === 'active'),
        history,
        idempotencyKey: crypto.randomBytes(16).toString('hex'),
        error: null,
        success: result.replay
          ? `Existing request returned (idempotent). Status: ${result.request.status}`
          : `Transfer request ${result.request.status}. Ref: ${result.request.externalReference || '—'}. Sandbox only — not real funds.`
      });
    } catch (err) {
      if (err.status === 400) {
        const links = await transferRepo.listLinksWithExternal(req.session.user.id);
        const history = await transferRepo.listForUser(req.session.user.id);
        return res.status(400).render('customer/transfers', {
          title: 'Transfers',
          path: '/app/transfers',
          links: links.filter((l) => l.linkStatus === 'active'),
          history,
          idempotencyKey: req.body.idempotencyKey || crypto.randomBytes(16).toString('hex'),
          error: err.message,
          success: null
        });
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
        return res.status(200).json({ ok: true, isDemo: true });
      } catch (err) {
        return res.status(400).json({ ok: false, error: 'bad_webhook' });
      }
    }
  );

  return router;
}

module.exports = { createTransferRouter };
