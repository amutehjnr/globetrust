
'use strict';

require('dotenv').config();

const { createDatabasePool } = require('../src/config/database');
const { createApp } = require('../src/app');

let poolPromise;

function getPool() {
  if (!poolPromise) {
    poolPromise = Promise.resolve().then(async () => {
      const pool = createDatabasePool();
      await pool.query('SELECT 1');
      return pool;
    }).catch((error) => {
      poolPromise = undefined;
      throw error;
    });
  }

  return poolPromise;
}

let appPromise;

module.exports = async function handler(req, res) {
  try {
    if (!appPromise) {
      appPromise = getPool().then((pool) => createApp(pool));
    }

    const app = await appPromise;
    return app(req, res);
  } catch (error) {
    console.error('Vercel application initialization failed:', error);

    if (!res.headersSent) {
      return res.status(500).send('Application initialization failed.');
    }
  }
};
