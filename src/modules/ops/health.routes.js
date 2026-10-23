'use strict';

const express = require('express');

/**
 * Liveness: process is up.
 * Readiness: dependencies required to serve traffic.
 */
function createHealthRouter({ pool }) {
  const router = express.Router();

  router.get('/health/live', (_req, res) => {
    res.status(200).json({ status: 'ok', ts: new Date().toISOString() });
  });

  router.get('/health/ready', async (_req, res) => {
    const checks = { mysql: false, redis: null };
    try {
      await pool.query('SELECT 1');
      checks.mysql = true;
    } catch {
      checks.mysql = false;
    }

    if (process.env.REDIS_URL) {
      try {
        const { createClient } = require('redis');
        const client = createClient({ url: process.env.REDIS_URL });
        await client.connect();
        await client.ping();
        await client.quit();
        checks.redis = true;
      } catch {
        checks.redis = false;
      }
    } else {
      checks.redis = 'not_configured';
    }

    const ready =
      checks.mysql === true &&
      (checks.redis === true || checks.redis === 'not_configured');

    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      checks,
      coreBankingMode: process.env.CORE_BANKING_MODE || 'sandbox',
      ts: new Date().toISOString()
    });
  });

  return router;
}

module.exports = { createHealthRouter };
