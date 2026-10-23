'use strict';

const express = require('express');

/**
 * Minimal process metrics for scrapers / uptime monitors.
 * Protect with network policy in production (private network only).
 */
function createMetricsRouter() {
  const router = express.Router();
  const startedAt = Date.now();

  router.get('/metrics', (req, res) => {
    // Optional shared token for metrics scrape
    const token = process.env.METRICS_TOKEN;
    if (token) {
      const provided = req.get('x-metrics-token') || req.query.token;
      if (provided !== token) {
        return res.status(401).json({ error: 'unauthorized' });
      }
    }

    const mem = process.memoryUsage();
    res.status(200).json({
      service: 'globe-trust-bank',
      uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      pid: process.pid,
      node: process.version,
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal
      },
      env: process.env.NODE_ENV || 'development',
      coreBankingMode: process.env.CORE_BANKING_MODE || 'sandbox',
      ts: new Date().toISOString()
    });
  });

  return router;
}

module.exports = { createMetricsRouter };
