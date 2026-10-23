'use strict';

require('dotenv').config();

const http = require('node:http');
const logger = require('./config/logger');
const { createDatabasePool } = require('./config/database');
const { createApp } = require('./app');
const { attachSocketServer } = require('./sockets');

async function start() {
  const pool = createDatabasePool();
  await pool.query('SELECT 1');

  const app = createApp(pool);
  const server = http.createServer(app);
  attachSocketServer(server, { supportService: app.get('supportService') });

  const port = Number(process.env.PORT || 3000);
  server.listen(port, () => logger.info({ port }, 'Globe Trust Bank app started'));

  // Optional structured heartbeat for log-based monitors
  const heartbeatMs = Number(process.env.HEARTBEAT_MS || 0);
  if (heartbeatMs >= 15000) {
    setInterval(() => {
      logger.info({
        event: 'heartbeat',
        uptimeSec: Math.floor(process.uptime()),
        memoryRss: process.memoryUsage().rss
      }, 'heartbeat');
    }, heartbeatMs).unref();
  }

  const shutdown = (signal) => {
    logger.info({ signal }, 'Shutdown requested');
    server.close(async () => {
      try { await pool.end(); } catch (error) {
        logger.error({ err: error }, 'Error closing database pool');
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((error) => {
  logger.fatal({ err: error }, 'Application failed to start');
  process.exit(1);
});
