'use strict';

/**
 * Reset or set a customer manual balance by email.
 *
 * Usage (from project root, with .env DB settings):
 *
 *   # Reset ALL currencies for this user to 0
 *   node scripts/reset-balance.js --email user@example.com
 *
 *   # Reset only USD to 0
 *   node scripts/reset-balance.js --email user@example.com --currency USD
 *
 *   # Set USD available/ledger to an exact amount
 *   node scripts/reset-balance.js --email user@example.com --currency USD --amount 1500
 *
 *   # List balances only (no change)
 *   node scripts/reset-balance.js --email user@example.com --list
 *
 * PowerShell:
 *   node scripts/reset-balance.js --email user@example.com --currency USD --amount 0
 */

const path = require('path');
const fs = require('fs');

function loadEnv() {
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '.env.local'),
    path.join(__dirname, '..', '.env')
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const text = fs.readFileSync(file, 'utf8');
      for (const line of text.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const i = t.indexOf('=');
        if (i <= 0) continue;
        const key = t.slice(0, i).trim();
        let val = t.slice(i + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) process.env[key] = val;
      }
      console.log('[env] loaded', file);
      break;
    } catch (_) {}
  }
}

loadEnv();

const mysql = require('mysql2/promise');

function argValue(name) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return null;
  const next = process.argv[i + 1];
  if (!next || next.startsWith('--')) return true;
  return next;
}

function argFlag(name) {
  return process.argv.includes('--' + name);
}

function binToUuid(buf) {
  if (!buf) return null;
  if (typeof buf === 'string' && buf.includes('-')) return buf;
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const h = b.toString('hex');
  return (
    h.slice(0, 8) +
    '-' +
    h.slice(8, 12) +
    '-' +
    h.slice(12, 16) +
    '-' +
    h.slice(16, 20) +
    '-' +
    h.slice(20)
  );
}

async function main() {
  const email = argValue('email');
  const listOnly = argFlag('list');
  let currency = argValue('currency');
  if (currency === true) currency = null;
  currency = currency ? String(currency).toUpperCase().slice(0, 3) : null;

  let amountRaw = argValue('amount');
  if (amountRaw === true) amountRaw = '0';
  // Default reset amount is 0
  const amount = amountRaw == null ? 0 : Number(amountRaw);
  if (Number.isNaN(amount) || amount < 0) {
    throw new Error('--amount must be a number >= 0');
  }

  if (!email || email === true) {
    console.error('Usage: node scripts/reset-balance.js --email user@example.com [--currency USD] [--amount 0] [--list]');
    process.exit(1);
  }

  const host = process.env.MYSQL_HOST || process.env.DB_HOST || '127.0.0.1';
  const port = Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306);
  const user = process.env.MYSQL_USER || process.env.DB_USER || 'root';
  const password = process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '';
  const database =
    process.env.MYSQL_DATABASE || process.env.DB_NAME || process.env.MYSQL_DB || 'globetrust';

  console.log('[reset-balance] connecting', { host, port, user, database });

  const pool = await mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 2
  });

  try {
    const [users] = await pool.query(
      `SELECT id, email, status FROM users WHERE LOWER(email) = ? LIMIT 1`,
      [String(email).toLowerCase().trim()]
    );
    if (!users[0]) {
      throw new Error('No user found for email: ' + email);
    }
    const u = users[0];
    const userId = u.id;
    console.log('[reset-balance] user', {
      id: binToUuid(userId),
      email: u.email,
      status: u.status
    });

    // Ensure table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS manual_balances (
        user_id BINARY(16) NOT NULL,
        currency_code CHAR(3) NOT NULL,
        available DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        ledger DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (user_id, currency_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    const [before] = await pool.query(
      `SELECT currency_code, available, ledger, updated_at
       FROM manual_balances WHERE user_id = ? ORDER BY currency_code`,
      [userId]
    );

    console.log('[reset-balance] balances before:');
    if (!before.length) {
      console.log('  (none)');
    } else {
      before.forEach((r) => {
        console.log(
          `  ${r.currency_code}: available=${r.available} ledger=${r.ledger}`
        );
      });
    }

    if (listOnly) {
      console.log('[reset-balance] --list only, no changes.');
      return;
    }

    if (currency) {
      // Set one currency
      const [existing] = await pool.query(
        `SELECT 1 FROM manual_balances WHERE user_id = ? AND currency_code = ? LIMIT 1`,
        [userId, currency]
      );
      if (existing[0]) {
        await pool.query(
          `UPDATE manual_balances
           SET available = ?, ledger = ?
           WHERE user_id = ? AND currency_code = ?`,
          [amount.toFixed(2), amount.toFixed(2), userId, currency]
        );
      } else {
        await pool.query(
          `INSERT INTO manual_balances (user_id, currency_code, available, ledger)
           VALUES (?, ?, ?, ?)`,
          [userId, currency, amount.toFixed(2), amount.toFixed(2)]
        );
      }
      console.log(
        `[reset-balance] set ${currency} available/ledger = ${amount.toFixed(2)}`
      );
    } else {
      // Reset all existing currencies to amount (default 0)
      if (!before.length) {
        // No rows — create USD at amount
        await pool.query(
          `INSERT INTO manual_balances (user_id, currency_code, available, ledger)
           VALUES (?, 'USD', ?, ?)`,
          [userId, amount.toFixed(2), amount.toFixed(2)]
        );
        console.log(
          `[reset-balance] no prior balances; created USD = ${amount.toFixed(2)}`
        );
      } else {
        for (const r of before) {
          await pool.query(
            `UPDATE manual_balances
             SET available = ?, ledger = ?
             WHERE user_id = ? AND currency_code = ?`,
            [amount.toFixed(2), amount.toFixed(2), userId, r.currency_code]
          );
          console.log(
            `[reset-balance] set ${r.currency_code} available/ledger = ${amount.toFixed(2)}`
          );
        }
      }
    }

    const [after] = await pool.query(
      `SELECT currency_code, available, ledger
       FROM manual_balances WHERE user_id = ? ORDER BY currency_code`,
      [userId]
    );
    console.log('[reset-balance] balances after:');
    after.forEach((r) => {
      console.log(
        `  ${r.currency_code}: available=${r.available} ledger=${r.ledger}`
      );
    });
    console.log('[reset-balance] done');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[reset-balance] FAILED', err.message || err);
  process.exit(1);
});