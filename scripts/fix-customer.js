'use strict';

/**
 * Fix a single customer so they can log in (role + optional activate / password).
 *
 * PowerShell examples:
 *
 *   node scripts/fix-customer.js --email user@example.com
 *
 *   node scripts/fix-customer.js --email user@example.com --activate
 *
 *   node scripts/fix-customer.js --email user@example.com --activate --password "TempPass123!"
 *
 * Uses .env: MYSQL_HOST, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD, MYSQL_PORT
 * (or DATABASE_URL)
 */

require('dotenv').config();

const mysql = require('mysql2/promise');

function arg(name, fallback = null) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  const next = process.argv[idx + 1];
  if (!next || next.startsWith('--')) return true; // boolean flag
  return next;
}

function createPool() {
  if (process.env.DATABASE_URL) {
    return mysql.createPool({
      uri: process.env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 1
    });
  }

  const host = process.env.MYSQL_HOST || process.env.DB_HOST;
  const database = process.env.MYSQL_DATABASE || process.env.DB_NAME;
  const user = process.env.MYSQL_USER || process.env.DB_USER;
  const password = process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '';
  const port = Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306);

  if (!host || !database || !user) {
    throw new Error(
      'Missing DB config. Set MYSQL_HOST, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD (or DATABASE_URL) in .env'
    );
  }

  console.log(`Connecting to ${host}:${port} / ${database} as ${user}`);
  return mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 1,
    charset: 'utf8mb4',
    timezone: 'Z'
  });
}

async function ensureCustomerRole(conn, userIdBin) {
  let roleId;
  const [roles] = await conn.query(`SELECT id FROM roles WHERE code = 'customer' LIMIT 1`);
  if (roles[0]) {
    roleId = roles[0].id;
  } else {
    const [ins] = await conn.query(
      `INSERT INTO roles (code, description) VALUES ('customer', 'Retail or business banking customer')`
    );
    roleId = ins.insertId;
    console.log('  created roles.customer');
  }

  const [existing] = await conn.query(
    `SELECT 1 FROM user_roles WHERE user_id = ? AND role_id = ? LIMIT 1`,
    [userIdBin, roleId]
  );
  if (existing[0]) {
    console.log('  customer role already assigned');
    return;
  }

  await conn.query(`INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`, [
    userIdBin,
    roleId
  ]);
  console.log('  assigned customer role');
}

async function main() {
  const emailRaw = arg('email');
  if (!emailRaw || emailRaw === true) {
    console.error('Usage: node scripts/fix-customer.js --email user@example.com [--activate] [--password "Temp123!"] [--no-mfa]');
    process.exit(1);
  }

  const email = String(emailRaw).toLowerCase().trim();
  const activate = Boolean(arg('activate'));
  const password = arg('password');
  const noMfa = Boolean(arg('no-mfa'));

  const pool = createPool();
  const conn = await pool.getConnection();

  try {
    const [rows] = await conn.query(
      `SELECT id, email, status, mfa_required, mfa_enrolled_at
       FROM users WHERE email = ? LIMIT 1`,
      [email]
    );

    if (!rows[0]) {
      console.error(`No user found with email: ${email}`);
      process.exitCode = 1;
      return;
    }

    const user = rows[0];
    console.log('Found user:');
    console.log(`  email:  ${user.email}`);
    console.log(`  status: ${user.status}`);
    console.log(`  mfa_required: ${user.mfa_required}`);
    console.log(`  mfa_enrolled: ${user.mfa_enrolled_at ? 'yes' : 'no'}`);

    await ensureCustomerRole(conn, user.id);

    if (activate && user.status !== 'active') {
      await conn.query(
        `UPDATE users
         SET status = 'active',
             email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP(6))
         WHERE id = ?`,
        [user.id]
      );
      console.log('  status set to active');
    }

    if (noMfa) {
      await conn.query(
        `UPDATE users SET mfa_required = 0 WHERE id = ?`,
        [user.id]
      );
      console.log('  mfa_required set to 0');
    }

    if (password && password !== true) {
      const argon2 = require('argon2');
      const hash = await argon2.hash(String(password), {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1
      });
      await conn.query(
        `UPDATE users
         SET password_hash = ?,
             password_changed_at = UTC_TIMESTAMP(6),
             failed_login_count = 0,
             locked_until = NULL
         WHERE id = ?`,
        [hash, user.id]
      );
      console.log('  password updated');
    }

    const [roles] = await conn.query(
      `SELECT r.code
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = ?`,
      [user.id]
    );
    const [again] = await conn.query(
      `SELECT status, mfa_required FROM users WHERE id = ? LIMIT 1`,
      [user.id]
    );

    console.log('');
    console.log('Done.');
    console.log(`  roles:  ${roles.map((r) => r.code).join(', ') || '(none)'}`);
    console.log(`  status: ${again[0].status}`);
    console.log(`  mfa_required: ${again[0].mfa_required}`);
    console.log('');
    console.log('Customer can sign in at /sign-in');
  } catch (err) {
    console.error('Failed:', err.message || err);
    if (err.code === 'ER_BAD_DB_ERROR') {
      console.error('Hint: MYSQL_DATABASE name is wrong or DB was not created.');
    }
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

main();