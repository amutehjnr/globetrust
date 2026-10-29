'use strict';
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
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
    multipleStatements: true,
    ssl
  });
  try {
    const [tables] = await pool.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'bank_cards' LIMIT 1`,
      [process.env.MYSQL_DATABASE]
    );
    if (tables.length) {
      console.log('OK: bank_cards already exists');
      return;
    }
    const sql = fs.readFileSync(
      path.join(__dirname, '../database/migrations/20261029_bank_cards.sql'),
      'utf8'
    );
    await pool.query(sql);
    console.log('OK: bank_cards created');
  } catch (err) {
    console.error('FAILED:', err.message || err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
main();