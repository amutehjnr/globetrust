'use strict';

/**
 * Fix 403 Access Denied for customer portal logins.
 *
 * What it does:
 *  1. Ensures the `customer` role exists
 *  2. Attaches `customer` role to every user who is not staff-only
 *  3. Optionally activates pending/locked accounts
 *  4. Clears failed_login_count / locked_until
 *
 * Usage (from project root):
 *   node scripts/fix-all-403.js
 *   node scripts/fix-all-403.js --activate-pending
 *   node scripts/fix-all-403.js --include-staff
 *   node scripts/fix-all-403.js --email someone@example.com
 *
 * Requires .env with DB credentials (same as the app).
 */

const path = require('path');
const fs = require('fs');

function loadEnv() {
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '.env.local'),
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '..', '..', '.env')
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

const STAFF_ROLES = ['admin', 'support_agent', 'kyc_reviewer', 'operations', 'auditor'];

function argFlag(name) {
  return process.argv.includes(name);
}

function argValue(name) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return null;
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
  const activatePending = argFlag('--activate-pending');
  const includeStaff = argFlag('--include-staff');
  const onlyEmail = argValue('--email');

  const host = process.env.MYSQL_HOST || process.env.DB_HOST || '127.0.0.1';
  const port = Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306);
  const user = process.env.MYSQL_USER || process.env.DB_USER || 'root';
  const password = process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '';
  const database =
    process.env.MYSQL_DATABASE || process.env.DB_NAME || process.env.MYSQL_DB || 'globetrust';

  console.log('[fix-all-403] connecting', { host, port, user, database });

  const pool = await mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 3
  });

  try {
    await pool.query(
      `INSERT IGNORE INTO roles (code, description)
       VALUES ('customer', 'Retail or business banking customer')`
    );
    const [roleRows] = await pool.query(
      `SELECT id, code FROM roles WHERE code = 'customer' LIMIT 1`
    );
    if (!roleRows[0]) {
      throw new Error('Failed to create/find customer role');
    }
    const customerRoleId = roleRows[0].id;
    console.log('[fix-all-403] customer role id =', customerRoleId);

    let usersSql = `
      SELECT u.id, u.email, u.status, u.failed_login_count, u.locked_until
      FROM users u
    `;
    const params = [];
    if (onlyEmail) {
      usersSql += ` WHERE LOWER(u.email) = ? `;
      params.push(String(onlyEmail).toLowerCase().trim());
    }
    usersSql += ` ORDER BY u.created_at ASC`;

    const [users] = await pool.query(usersSql, params);
    console.log('[fix-all-403] users found:', users.length);

    let roleAttached = 0;
    let statusFixed = 0;
    let unlocks = 0;
    let skippedStaff = 0;

    for (const u of users) {
      const email = u.email;
      const userId = u.id;

      const [roleCodes] = await pool.query(
        `SELECT r.code
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = ?`,
        [userId]
      );
      const codes = roleCodes.map((r) => r.code);
      const isStaff = codes.some((c) => STAFF_ROLES.includes(c));

      if (isStaff && !includeStaff && !codes.includes('customer')) {
        skippedStaff += 1;
        console.log('  skip staff', email, codes.join(','));
      } else if (!codes.includes('customer')) {
        await pool.query(
          `INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)`,
          [userId, customerRoleId]
        );
        roleAttached += 1;
        console.log('  + customer role →', email, binToUuid(userId));
      } else {
        console.log('  ok role      →', email);
      }

      const patches = [];
      if (activatePending && (u.status === 'pending' || u.status === 'locked')) {
        patches.push(`status = 'active'`);
        statusFixed += 1;
      }
      if (u.failed_login_count > 0 || u.locked_until) {
        patches.push(`failed_login_count = 0`);
        patches.push(`locked_until = NULL`);
        unlocks += 1;
      }
      if (patches.length) {
        await pool.query(
          `UPDATE users SET ${patches.join(', ')} WHERE id = ?`,
          [userId]
        );
        console.log('  status/unlock →', email, patches.join(', '));
      }
    }

    console.log('\n[fix-all-403] done');
    console.log('  customer roles attached:', roleAttached);
    console.log('  status activated:       ', statusFixed);
    console.log('  unlocks cleared:        ', unlocks);
    console.log('  staff skipped:          ', skippedStaff);
    console.log('\nUsers can sign in again. Hard-refresh the browser if a session is stuck.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[fix-all-403] FAILED', err.message || err);
  process.exit(1);
});