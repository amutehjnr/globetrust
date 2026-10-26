'use strict';

const { isPositiveAmount, normalizeAmount } = require('../utils/money');

function createTransferService({ transferRepo, coreBanking, logger, alertService }) {
  return {
    async getBalancesForLinks(links) {
      const out = [];
      for (const link of links) {
        if (link.linkStatus !== 'active') {
          out.push({ ...link, balance: null, note: 'inactive_link' });
          continue;
        }
        try {
          const bal = await coreBanking.getBalance({
            externalAccountRef: link.externalAccountRef,
            currency: link.currencyCode
          });
          out.push({
            ...link,
            balance: bal,
            note: null
          });
        } catch (err) {
          logger.error({ err, linkId: link.id }, 'Balance fetch failed');
          out.push({ ...link, balance: null, note: 'provider_error' });
        }
      }
      return out;
    },

    async createTransfer({
      userId,
      sourceAccountLinkId,
      amount,
      destinationAccountRef,
      destinationBankCode,
      destinationCurrency,
      narrative,
      idempotencyKey
    }) {
      if (!idempotencyKey || String(idempotencyKey).length < 8) {
        const err = new Error('Idempotency key is required.');
        err.status = 400;
        throw err;
      }

      const existing = await transferRepo.findByIdempotency(userId, idempotencyKey);
      if (existing) {
        return { request: existing, replay: true };
      }

      if (!isPositiveAmount(amount)) {
        const err = new Error('Enter a valid amount greater than zero.');
        err.status = 400;
        throw err;
      }
      const normalized = normalizeAmount(amount, 2);
      if (!destinationAccountRef || String(destinationAccountRef).length < 4) {
        const err = new Error('Enter a valid destination account reference.');
        err.status = 400;
        throw err;
      }

      const link = await transferRepo.getAccountLinkOwned(userId, sourceAccountLinkId);
      if (!link || link.linkStatus !== 'active') {
        const err = new Error('Source account link is not available.');
        err.status = 400;
        throw err;
      }

      const beneficiary = await coreBanking.validateBeneficiary({
        accountNumber: destinationAccountRef,
        currency: destinationCurrency || link.currencyCode
      });
      if (!beneficiary.valid) {
        const err = new Error('Beneficiary could not be validated.');
        err.status = 400;
        throw err;
      }

      const destBuf = Buffer.from(String(destinationAccountRef), 'utf8');

      const requestId = await transferRepo.createRequest({
        userId,
        providerCode: coreBanking.code,
        idempotencyKey,
        sourceAccountLinkId: link.id,
        destinationCiphertext: destBuf,
        sourceCurrency: link.currencyCode,
        destinationCurrency: destinationCurrency || link.currencyCode,
        sourceAmount: normalized,
        destinationAmount: normalized,
        status: 'submitted',
        externalReference: null
      });

      await transferRepo.addEvent(requestId, 'created', { mode: process.env.CORE_BANKING_MODE || 'manual' });

      const result = await coreBanking.initiateTransfer({
        idempotencyKey: `${userId}:${idempotencyKey}`,
        sourceExternalRef: link.externalAccountRef,
        sourceCurrency: link.currencyCode,
        amount: normalized,
        destinationAccountRef,
        destinationCurrency: destinationCurrency || link.currencyCode,
        narrative: destinationBankCode
          ? `[${destinationBankCode}] ${narrative || ''}`.trim()
          : narrative
      });

      if (result.status === 'succeeded') {
        await transferRepo.updateStatus(requestId, {
          status: 'succeeded',
          externalReference: result.providerReference,
          failureCode: null,
          completed: true
        });
        await transferRepo.addEvent(requestId, 'provider_succeeded', {
          providerReference: result.providerReference
        });

        if (alertService?.notifyTransferSuccess) {
          try {
            await alertService.notifyTransferSuccess({
              userId,
              amount: normalized,
              currency: link.currencyCode,
              narrative: narrative || `TRANSFER to ${destinationAccountRef}`,
              accountRef: link.externalAccountRef || link.id,
              direction: 'debit'
            });
          } catch (alertErr) {
            logger?.error?.({ alertErr, requestId }, 'Debit alert failed');
          }
        }
      } else if (result.status === 'submitted' || result.status === 'pending_approval' || result.status === 'processing') {
        await transferRepo.updateStatus(requestId, {
          status: result.status === 'pending_approval' ? 'pending_approval' : 'submitted',
          externalReference: result.providerReference,
          failureCode: null,
          completed: false
        });
        await transferRepo.addEvent(requestId, 'submitted_for_processing', {
          providerReference: result.providerReference,
          mode: 'manual'
        });

        // Alert that debit was instructed (manual queue)
        if (alertService?.notifyTransferSuccess) {
          try {
            await alertService.notifyTransferSuccess({
              userId,
              amount: normalized,
              currency: link.currencyCode,
              narrative: narrative || `TRANSFER to ${destinationAccountRef}`,
              accountRef: link.externalAccountRef || link.id,
              direction: 'debit'
            });
          } catch (alertErr) {
            logger?.error?.({ alertErr, requestId }, 'Debit alert failed');
          }
        }
      } else {
        await transferRepo.updateStatus(requestId, {
          status: 'failed',
          externalReference: result.providerReference,
          failureCode: result.failureCode || 'provider_failed',
          completed: true
        });
        await transferRepo.addEvent(requestId, 'provider_failed', {
          failureCode: result.failureCode
        });
      }

      const request = await transferRepo.getOwned(userId, requestId);
      return { request, replay: false, provider: result };
    },

    async refreshStatus(userId, requestId) {
      const request = await transferRepo.getOwned(userId, requestId);
      if (!request) {
        const err = new Error('Transfer request not found.');
        err.status = 404;
        throw err;
      }
      if (!request.externalReference) {
        return request;
      }
      const status = await coreBanking.getTransferStatus(request.externalReference);
      if (status.status && status.status !== request.status) {
        await transferRepo.updateStatus(requestId, {
          status: status.status === 'succeeded' ? 'succeeded' : status.status,
          externalReference: request.externalReference,
          failureCode: request.failureCode,
          completed: status.status === 'succeeded' || status.status === 'failed'
        });
        await transferRepo.addEvent(requestId, 'status_refresh', {
          providerStatus: status.status,
          isDemo: status.isDemo
        });
      }
      return transferRepo.getOwned(userId, requestId);
    }
  };
}

module.exports = { createTransferService };