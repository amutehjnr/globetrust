'use strict';

const express = require('express');
const multer = require('multer');
const { requireAuth, requireRole } = require('../../middleware/authz');
const { requireCsrf } = require('../../middleware/csrf');

function staffLocals(req, extra = {}) {
  const email = req.session.user?.email || 'admin';
  return {
    displayName: email.split('@')[0],
    initials: email.slice(0, 2).toUpperCase(),
    path: extra.path || '/admin/support',
    ...extra
  };
}

function createSupportRouter({ supportService, supportRepo, supportUpload }) {
  const router = express.Router();

  /**
   * Logged-in customer, including MFA-pending (pendingMfaUser).
   * Not guests — must have signed in (password ok). MFA not required for support chat.
   */
  function getChatUser(req) {
    if (req.session?.user?.id) return req.session.user;
    if (req.session?.pendingMfaUser?.id) {
      const u = req.session.pendingMfaUser;
      const roles = Array.isArray(u.roles) && u.roles.length ? u.roles : ['customer'];
      return { ...u, roles };
    }
    return null;
  }

  function requireChatAuth(req, res, next) {
    const user = getChatUser(req);
    if (!user?.id) {
      if (req.accepts('html')) {
        return res.redirect('/sign-in?next=' + encodeURIComponent(req.originalUrl || '/'));
      }
      return res.status(401).json({ error: 'Authentication required' });
    }
    req.chatUser = user;
    next();
  }


  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter(_req, file, cb) {
      const ok = supportUpload
        ? supportUpload.allowedMime.has(String(file.mimetype || '').toLowerCase())
        : String(file.mimetype || '').startsWith('image/') ||
          file.mimetype === 'application/pdf';
      cb(ok ? null : new Error('File type not allowed.'), ok);
    }
  });

  async function broadcastMessage(req, conversation, message) {
    try {
      const io = req.app.get('io');
      if (!io || !message || !conversation) return;
      if (typeof io.supportBroadcast === 'function') {
        await io.supportBroadcast({
          conversation,
          message,
          sender: req.chatUser || req.session.user
        });
        return;
      }
      // Fallback: room-only emit
      io.to(`support:${conversation.id}`).emit('support:message', {
        conversationId: conversation.id,
        message: {
          id: message.id,
          senderUserId: message.senderUserId,
          text: message.text,
          type: message.type || 'text',
          attachmentUrl: message.attachmentUrl || null,
          attachmentName: message.attachmentName || null,
          attachmentMime: message.attachmentMime || null,
          createdAt: message.createdAt
        }
      });
    } catch (_) {}
  }

  router.get('/app/support', requireChatAuth, async (req, res, next) => {
    try {
      const user = req.chatUser;
      const { conversation, messages } = await supportService.getOrCreateCustomerConversation(
        user.id,
        'Online banking help'
      );
      res.render('customer/support', {
        title: 'Support',
        path: '/app/support',
        conversation,
        messages,
        userId: user.id
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/app/support/api', requireChatAuth, async (req, res, next) => {
    try {
      const user = req.chatUser;
      const { conversation, messages } = await supportService.getOrCreateCustomerConversation(
        user.id,
        'Online banking help'
      );
      res.json({
        ok: true,
        conversationId: conversation.id,
        userId: user.id,
        messages: (messages || []).map((m) => ({
          id: m.id,
          text: m.text || '',
          type: m.type || 'text',
          senderUserId: m.senderUserId,
          attachmentUrl: m.attachmentUrl || null,
          attachmentName: m.attachmentName || null,
          attachmentMime: m.attachmentMime || null,
          createdAt: m.createdAt
        }))
      });
    } catch (err) {
      next(err);
    }
  });

  // Text and/or file (multipart). Multer first so CSRF can read body fields.
  router.post(
    '/app/support/messages',
    requireChatAuth,
    (req, res, next) => {
      upload.single('file')(req, res, (err) => {
        if (err) {
          err.status = 400;
          return next(err);
        }
        next();
      });
    },
    requireCsrf,
    async (req, res, next) => {
      try {
        let attachment = null;
        if (req.file) {
          if (!supportUpload) {
            const e = new Error('File uploads are not configured.');
            e.status = 503;
            throw e;
          }
          attachment = await supportUpload.upload(req.file);
        }
        const result = await supportService.postMessage(
          req.chatUser,
          req.body.conversationId,
          req.body.text,
          attachment
        );
        await broadcastMessage(req, result.conversation, result.message);

        const wantsJson =
          (req.headers.accept && String(req.headers.accept).includes('application/json')) ||
          req.xhr ||
          req.body.ajax === '1';

        if (wantsJson) {
          const m = result.message;
          return res.json({
            ok: true,
            message: {
              id: m.id,
              text: m.text,
              type: m.type,
              senderUserId: m.senderUserId,
              attachmentUrl: m.attachmentUrl,
              attachmentName: m.attachmentName,
              attachmentMime: m.attachmentMime,
              createdAt: m.createdAt
            }
          });
        }
        res.redirect(303, '/app/support');
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    '/admin/support',
    requireAuth,
    requireRole('support_agent', 'admin', 'operations'),
    async (req, res, next) => {
      try {
        const queue = await supportRepo.listOpenForAgents();
        res.render(
          'admin/support-inbox',
          staffLocals(req, {
            title: 'Support inbox',
            path: '/admin/support',
            queue: queue || []
          })
        );
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
          conversation.assignedAgentUserId = req.session.user.id;
        }
        const messages = await supportRepo.listMessages(conversation.id);
        res.render(
          'admin/support-thread',
          staffLocals(req, {
            title: 'Conversation',
            path: '/admin/support',
            conversation,
            messages: messages || [],
            userId: req.session.user.id
          })
        );
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
        // Staff reply text only — customers upload; agents view attachments in the thread
        const result = await supportService.postMessage(
          req.session.user,
          req.params.id,
          req.body.text,
          null
        );
        await broadcastMessage(req, result.conversation, result.message);

        const wantsJson =
          (req.headers.accept && String(req.headers.accept).includes('application/json')) ||
          req.xhr ||
          req.body.ajax === '1';
        if (wantsJson) {
          const m = result.message;
          return res.json({
            ok: true,
            message: {
              id: m.id,
              text: m.text,
              type: m.type,
              senderUserId: m.senderUserId,
              attachmentUrl: m.attachmentUrl,
              attachmentName: m.attachmentName,
              attachmentMime: m.attachmentMime,
              createdAt: m.createdAt
            }
          });
        }
        res.redirect(303, `/admin/support/${req.params.id}`);
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/admin/support/:id/close',
    requireAuth,
    requireRole('support_agent', 'admin', 'operations'),
    requireCsrf,
    async (req, res, next) => {
      try {
        await supportService.assertCanAccess(req.session.user, req.params.id);
        await supportRepo.setStatus(req.params.id, 'closed');
        res.redirect(303, '/admin/support');
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

module.exports = { createSupportRouter };