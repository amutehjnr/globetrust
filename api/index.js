'use strict';

require('dotenv').config();

const { createDatabasePool } = require('../src/config/database');
const { createApp } = require('../src/app');

let poolPromise;
let appPromise;

function logError(tag, error, extra = {}) {
  const payload = {
    tag,
    message: error?.message || String(error),
    name: error?.name,
    code: error?.code,
    status: error?.status,
    stack: error?.stack,
    ...extra
  };
  console.error('[GLOBE_ERROR]', JSON.stringify(payload, null, 2));
  if (error?.stack) {
    console.error(error.stack);
  }
}

function getPool() {
  if (!poolPromise) {
    poolPromise = Promise.resolve()
      .then(async () => {
        console.log('[GLOBE] Creating database pool...', {
          host: process.env.MYSQL_HOST || '(missing)',
          database: process.env.MYSQL_DATABASE || '(missing)',
          user: process.env.MYSQL_USER || '(missing)'
        });
        const pool = createDatabasePool();
        await pool.query('SELECT 1');
        console.log('[GLOBE] Database pool ready');
        return pool;
      })
      .catch((error) => {
        poolPromise = undefined;
        logError('database_init', error);
        throw error;
      });
  }
  return poolPromise;
}

// Process-level handlers (visible in Vercel function logs)
process.on('unhandledRejection', (reason) => {
  logError('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)));
});
process.on('uncaughtException', (error) => {
  logError('uncaughtException', error);
});

module.exports = async function handler(req, res) {
  const started = Date.now();
  const method = req.method;
  const url = req.url;

  console.log('[GLOBE_REQ]', JSON.stringify({ method, url }));

  try {
    if (!appPromise) {
      appPromise = getPool()
        .then((pool) => {
          console.log('[GLOBE] Building Express app...');
          const app = createApp(pool);
          console.log('[GLOBE] Express app ready');
          return app;
        })
        .catch((error) => {
          appPromise = undefined;
          logError('app_init', error);
          throw error;
        });
    }

    const app = await appPromise;
    return app(req, res);
  } catch (error) {
    logError('handler', error, { method, url, ms: Date.now() - started });

    if (!res.headersSent) {
      res.status(500);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      const msg = process.env.NODE_ENV === 'production' && process.env.DEBUG_ERRORS !== 'true'
        ? 'Application initialization failed. Check Vercel function logs for [GLOBE_ERROR].'
        : `Application initialization failed: ${error?.message || error}`;
      return res.end(msg);
    }
  }
};