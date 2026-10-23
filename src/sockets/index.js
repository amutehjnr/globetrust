'use strict';

const { Server } = require('socket.io');
const logger = require('../config/logger');
const { getSessionMiddleware } = require('../middleware/session');

/**
 * Attach Socket.IO with the same Express session cookie.
 * Authorize conversation rooms against the database — never trust client role claims alone.
 */
function attachSocketServer(httpServer, { supportService } = {}) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    serveClient: false,
    maxHttpBufferSize: 20_000,
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

  io.on('connection', (socket) => {
    const user = socket.data.user;
    logger.info({ socketId: socket.id, userId: user.id }, 'Socket connected');

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
        const room = `support:${conversation.id}`;
        io.to(room).emit('support:message', {
          conversationId: conversation.id,
          message: {
            id: message.id,
            senderUserId: message.senderUserId,
            text: message.text,
            createdAt: message.createdAt
          }
        });
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
