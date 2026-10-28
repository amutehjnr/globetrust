'use strict';

/**
 * Add spending_limits JSON column to customer_profiles (idempotent).
 * Usage: node scripts/add-spending-limits-column.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

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

  const db = process.env.MYSQL_DATABASE;
  try {
    const [cols] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'customer_profiles'
         AND COLUMN_NAME = 'spending_limits' LIMIT 1`,
      [db]
    );
    if (cols.length) {
      console.log('OK: spending_limits already exists');
      return;
    }
    await pool.query(
      `ALTER TABLE customer_profiles
       ADD COLUMN spending_limits JSON NULL`
    );
    console.log('OK: spending_limits column added');
  } catch (err) {
    if (err && err.code === 'ER_DUP_FIELDNAME') {
      console.log('OK: column already exists');
      return;
    }
    console.error('FAILED:', err.message || err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();