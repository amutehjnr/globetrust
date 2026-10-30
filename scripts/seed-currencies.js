'use strict';
require('dotenv').config();
const mysql = require('mysql2/promise');
const { COUNTRY_CURRENCY } = require('../src/utils/currency');

async function main() {
  const required = ['MYSQL_HOST', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD'];
  for (const key of required) {
    if (!process.env[key]) {
      console.error('Missing env:', key);
      process.exit(1);
    }
  }
  const ssl =
    String(process.env.MYSQL_SSL || '').toLowerCase() === 'true' ||
    String(process.env.MYSQL_SSL || '') === '1'
      ? { rejectUnauthorized: false }
      : undefined;
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    database: process.env.MYSQL_DATABASE,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    connectionLimit: 2,
    charset: 'utf8mb4',
    ssl
  });

  const byCode = new Map();
  Object.values(COUNTRY_CURRENCY).forEach((c) => {
    if (c && c.code) byCode.set(c.code, c.name || c.code);
  });
  // Always include core set
  byCode.set('NGN', 'Nigerian Naira');
  byCode.set('USD', 'United States Dollar');
  byCode.set('GBP', 'Pound Sterling');
  byCode.set('EUR', 'Euro');

  let n = 0;
  for (const [code, name] of byCode) {
    await pool.query(
      `INSERT IGNORE INTO currencies (code, name, minor_units, is_enabled) VALUES (?, ?, 2, TRUE)`,
      [code, name]
    );
    n += 1;
  }
  console.log('OK: seeded/ensured', n, 'currencies');
  await pool.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});