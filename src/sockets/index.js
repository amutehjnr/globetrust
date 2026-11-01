'use strict';

const { Server } = require('socket.io');
const { getSessionMiddleware } = require('../middleware/session');
const logger = require('../config/logger');

function isStaffUser(user) {
  const roles = (user && user.roles) || [];
  return roles.some((r) =>
    ['support_agent', 'admin', 'operations'].includes(r)
  );
}

function attachSocketServer(httpServer, { supportService, notificationWriter } = {}) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    serveClient: false,
    maxHttpBufferSize: 1e6,
    cors: { origin: false }
  });

  const sessionMiddleware = getSessionMiddleware();

  io.engine.use((req, res, next) => {
    sessionMiddleware(req, res, next);
  });

  io.use((socket, next) => {
    const user = socket.request.session?.user;
    if (!user?.id) {
      return next(new Error('unauthorized'));
    }
    socket.data.user = user;
    next();
  });

  async function supportBroadcast({ conversation, message, sender }) {
    if (!conversation || !message) return;

    const room = `support:${conversation.id}`;
    const payload = {
      conversationId: conversation.id,
      message: {
        id: message.id,
        senderUserId: message.senderUserId,
        text: message.text,
        type: message.type || 'text',
        attachmentUrl: message.attachmentUrl || null,
        attachmentName: message.attachmentName || null,
        attachmentMime: message.attachmentMime || null,
        createdAt: message.createdAt || new Date().toISOString()
      }
    };

    io.to(room).emit('support:message', payload);

    const staffSender = isStaffUser(sender);
    const preview = String(message.text || message.attachmentName || 'New message').slice(0, 180);

    if (staffSender && conversation.customerUserId) {
      const note = {
        type: 'support_message',
        title: 'Support replied',
        body: preview,
        conversationId: conversation.id,
        createdAt: new Date().toISOString()
      };
      io.to(`user:${conversation.customerUserId}`).emit('notification:new', note);
      io.to(`user:${conversation.customerUserId}`).emit('support:notify', {
        conversationId: conversation.id,
        preview
      });
      if (notificationWriter) {
        try {
          await notificationWriter({
            userId: conversation.customerUserId,
            type: 'support_message',
            title: note.title,
            body: preview
          });
        } catch (err) {
          logger.warn({ err }, 'Failed to persist support notification');
        }
      }
    }

    if (!staffSender) {
      const inboxPayload = {
        conversationId: conversation.id,
        preview,
        customerUserId: conversation.customerUserId,
        createdAt: new Date().toISOString()
      };
      io.to('staff:support').emit('support:inbox', inboxPayload);

      if (conversation.assignedAgentUserId) {
        const note = {
          type: 'support_message',
          title: 'Customer message',
          body: preview,
          conversationId: conversation.id,
          createdAt: new Date().toISOString()
        };
        io.to(`user:${conversation.assignedAgentUserId}`).emit('notification:new', note);
        if (notificationWriter) {
          try {
            await notificationWriter({
              userId: conversation.assignedAgentUserId,
              type: 'support_message',
              title: note.title,
              body: preview
            });
          } catch (err) {
            logger.warn({ err }, 'Failed to persist agent notification');
          }
        }
      }
    }
  }

  io.supportBroadcast = supportBroadcast;

  io.on('connection', (socket) => {
    const user = socket.data.user;
    logger.info({ socketId: socket.id, userId: user.id }, 'Socket connected');

    socket.join(`user:${user.id}`);
    if (isStaffUser(user)) {
      socket.join('staff:support');
    }

    socket.on('support:join', async (payload, ack) => {
      try {
        const conversationId = payload?.conversationId;
        if (!conversationId || !supportService) {
          throw Object.assign(new Error('invalid_join'), { status: 400 });
        }
        await supportService.assertCanAccess(user, conversationId);
        const room = `support:${conversationId}`;
        await socket.join(room);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        logger.warn({ err, userId: user.id }, 'support:join denied');
        if (typeof ack === 'function') {
          ack({ ok: false, error: err.status === 403 ? 'forbidden' : 'join_failed' });
        }
      }
    });

    socket.on('support:message', async (payload, ack) => {
      try {
        if (!supportService) throw new Error('unavailable');
        const conversationId = payload?.conversationId;
        const text = payload?.text;
        const { message, conversation } = await supportService.postMessage(
          user,
          conversationId,
          text
        );
        await supportBroadcast({ conversation, message, sender: user });
        if (typeof ack === 'function') ack({ ok: true, id: message.id });
      } catch (err) {
        logger.warn({ err, userId: user.id }, 'support:message failed');
        if (typeof ack === 'function') {
          ack({ ok: false, error: err.message || 'send_failed' });
        }
      }
    });

    socket.on('disconnect', (reason) => {
      logger.info({ socketId: socket.id, reason }, 'Socket disconnected');
    });
  });

  return io;
}

module.exports = { attachSocketServer };