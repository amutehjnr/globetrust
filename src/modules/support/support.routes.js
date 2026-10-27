'use strict';

const express = require('express');
const { requireAuth, requireRole } = require('../../middleware/authz');
const { requireCsrf } = require('../../middleware/csrf');

function createSupportRouter({ supportService, supportRepo }) {
  const router = express.Router();

  router.get('/app/support', requireAuth, async (req, res, next) => {
    try {
      const { conversation, messages } = await supportService.getOrCreateCustomerConversation(
        req.session.user.id,
        'Online banking help'
      );
      res.render('customer/support', {
        title: 'Support',
        path: '/app/support',
        conversation,
        messages,
        userId: req.session.user.id
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/app/support/api', requireAuth, async (req, res, next) => {
    try {
      const { conversation, messages } = await supportService.getOrCreateCustomerConversation(
        req.session.user.id,
        'Online banking help'
      );
      res.json({
        ok: true,
        conversationId: conversation.id,
        userId: req.session.user.id,
        messages: (messages || []).map((m) => ({
          id: m.id,
          text: m.text || '',
          senderUserId: m.senderUserId,
          createdAt: m.createdAt
        }))
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/app/support/messages', requireAuth, requireCsrf, async (req, res, next) => {
    try {
      const result = await supportService.postMessage(
        req.session.user,
        req.body.conversationId,
        req.body.text
      );
      if (req.headers.accept && String(req.headers.accept).includes('application/json')) {
        const m = result && result.message ? result.message : null;
        return res.json({
          ok: true,
          message: {
            id: m && m.id,
            text: (m && m.text) || req.body.text,
            senderUserId: (m && m.senderUserId) || req.session.user.id,
            createdAt: (m && m.createdAt) || new Date().toISOString()
          }
        });
      }
      res.redirect('/app/support');
    } catch (err) {
      next(err);
    }
  });

  router.get(
    '/admin/support',
    requireAuth,
    requireRole('support_agent', 'admin', 'operations'),
    async (req, res, next) => {
      try {
        const queue = await supportRepo.listOpenForAgents();
        res.render('admin/support-inbox', {
          title: 'Support inbox',
          path: '/admin/support',
          queue
        });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    '/admin/support/:id',
    requireAuth,
    requireRole('support_agent', 'admin', 'operations'),
    async (req, res, next) => {
      try {
        const conversation = await supportService.assertCanAccess(
          req.session.user,
          req.params.id
        );
        if (!conversation.assignedAgentUserId) {
          await supportRepo.assignAgent(conversation.id, req.session.user.id);
        }
        const messages = await supportRepo.listMessages(conversation.id);
        res.render('admin/support-thread', {
          title: 'Conversation',
          path: '/admin/support',
          conversation,
          messages,
          userId: req.session.user.id
        });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/admin/support/:id/messages',
    requireAuth,
    requireRole('support_agent', 'admin', 'operations'),
    requireCsrf,
    async (req, res, next) => {
      try {
        await supportService.postMessage(req.session.user, req.params.id, req.body.text);
        res.redirect(`/admin/support/${req.params.id}`);
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

module.exports = { createSupportRouter };