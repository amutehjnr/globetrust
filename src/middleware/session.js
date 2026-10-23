'use strict';

const session = require('express-session');
const logger = require('../config/logger');

let _middleware = null;

/**
 * Session configuration.
 * Production: Redis store (connect-redis + redis client).
 * Development fallback: MemoryStore only if SESSION_ALLOW_MEMORY=true (single process).
 * Same middleware instance is shared with Socket.IO.
 */
function createSessionMiddleware() {
  if (_middleware) return _middleware;

  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set and at least 32 characters');
  }

  const base = {
    name: process.env.SESSION_COOKIE_NAME || 'gtb.sid',
    secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: process.env.SESSION_COOKIE_SECURE === 'true',
      sameSite: process.env.SESSION_COOKIE_SAMESITE || 'lax',
      maxAge: Number(process.env.SESSION_IDLE_MS || 30 * 60 * 1000)
    }
  };

  if (process.env.REDIS_URL) {
    try {
      const { RedisStore } = require('connect-redis');
      const { createClient } = require('redis');
      const client = createClient({ url: process.env.REDIS_URL });
      client.on('error', (err) => logger.error({ err }, 'Redis session client error'));
      client.connect().catch((err) => logger.error({ err }, 'Redis connect failed'));
      base.store = new RedisStore({ client, prefix: 'gtb:sess:' });
      logger.info('Session store: Redis');
    } catch (err) {
      logger.warn({ err }, 'Redis session unavailable');
      if (process.env.SESSION_ALLOW_MEMORY !== 'true') {
        throw new Error('Redis required for sessions (or set SESSION_ALLOW_MEMORY=true for local dev only)');
      }
      logger.warn('Session store: MemoryStore (dev only)');
    }
  } else if (process.env.SESSION_ALLOW_MEMORY === 'true') {
    logger.warn('Session store: MemoryStore (dev only — not for production)');
  } else {
    throw new Error('Set REDIS_URL or SESSION_ALLOW_MEMORY=true');
  }

  _middleware = session(base);
  return _middleware;
}

function getSessionMiddleware() {
  if (!_middleware) return createSessionMiddleware();
  return _middleware;
}

module.exports = { createSessionMiddleware, getSessionMiddleware };
