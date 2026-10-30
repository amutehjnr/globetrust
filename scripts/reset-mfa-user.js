'use strict';
/**
 * Reset MFA for one user so they can enrol again.
 *
 * Usage:
 *   node scripts/reset-mfa-user.js
 *   node scripts/reset-mfa-user.js 2e3fdb37-17a3-4308-b418-8d174324a69b
 *   node scripts/reset-mfa-user.js user@example.com
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const { isUuid, uuidToBinary } = require('../src/utils/ids');

async function main() {
  const arg = process.argv[2] || '2e3fdb37-17a3-4308-b418-8d174324a69b';

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

  try {
    let userId = null;
    let email = null;

    if (isUuid(arg)) {
      userId = arg;
      const [rows] = await pool.query(
        `SELECT id, email FROM users WHERE id = ? LIMIT 1`,
        [uuidToBinary(userId)]
      );
      if (!rows[0]) {
        console.error('No user with id:', userId);
        process.exitCode = 1;
        return;
      }
      email = rows[0].email;
    } else {
      const [rows] = await pool.query(
        `SELECT id, email FROM users WHERE email = ? LIMIT 1`,
        [String(arg).trim().toLowerCase()]
      );
      if (!rows[0]) {
        console.error('No user with email:', arg);
        process.exitCode = 1;
        return;
      }
      const { binaryToUuid } = require('../src/utils/ids');
      userId = binaryToUuid(rows[0].id);
      email = rows[0].email;
    }

    const uid = uuidToBinary(userId);

    const [del] = await pool.query(
      `DELETE FROM mfa_totp_secrets WHERE user_id = ?`,
      [uid]
    );

    const [upd] = await pool.query(
      `UPDATE users SET mfa_enrolled_at = NULL WHERE id = ?`,
      [uid]
    );

    console.log('OK: MFA reset');
    console.log('  userId:', userId);
    console.log('  email:', email);
    console.log('  secrets deleted:', del.affectedRows);
    console.log('  users updated:', upd.affectedRows);
    console.log('User can sign in and enrol MFA again at /mfa/enrol');
  } catch (err) {
    console.error('FAILED:', err.message || err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();