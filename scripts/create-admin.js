'use strict';

/**
 * Create or promote a super-user (admin).
 *
 * Usage:
 *   node scripts/create-admin.js --email admin@example.com --password 'YourStrongPass1'
 *
 * Optional:
 *   --first Admin --last User
 *   --roles admin,operations   (default: admin)
 *   --mfa-off                  (set mfa_required = FALSE so you can log in without MFA first)
 *
 * Loads .env from project root (MYSQL_HOST, MYSQL_PORT, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD).
 * For Aiven SSL: MYSQL_SSL=true
 */

require('dotenv').config();

const mysql = require('mysql2/promise');
const { hashPassword } = require('../src/utils/password');
const { newBinaryId, binaryToUuid } = require('../src/utils/ids');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const email = (arg('email') || '').trim().toLowerCase();
  const password = arg('password') || '';
  const firstName = arg('first', 'Admin');
  const lastName = arg('last', 'User');
  const rolesCsv = arg('roles', 'admin');
  const mfaOff = hasFlag('mfa-off');

  if (!email || !password) {
    console.error('Usage: node scripts/create-admin.js --email sanimustapha2215@gmail.com --password \'YourStrongPass1\' [--mfa-off]');
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('Password must be at least 12 characters.');
    process.exit(1);
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    console.error('Password must include uppercase, lowercase, and a number.');
    process.exit(1);
  }

  const required = ['MYSQL_HOST', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD'];
  for (const key of required) {
    if (!process.env[key]) {
      console.error(`Missing env: ${key}`);
      process.exit(1);
    }
  }

  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    database: process.env.MYSQL_DATABASE,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    waitForConnections: true,
    connectionLimit: 2,
    charset: 'utf8mb4',
    ssl: process.env.MYSQL_SSL === 'true'
      ? { rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED !== 'false' }
      : undefined
  });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Ensure roles exist
    await conn.query(
      `INSERT IGNORE INTO roles (code, description) VALUES
       ('customer', 'Retail or business banking customer'),
       ('support_agent', 'Customer support agent'),
       ('kyc_reviewer', 'KYC review officer'),
       ('operations', 'Bank operations staff'),
       ('auditor', 'Read-only audit role'),
       ('admin', 'Privileged platform administrator')`
    );

    const roleCodes = rolesCsv.split(',').map((r) => r.trim()).filter(Boolean);
    const [roleRows] = await conn.query(
      `SELECT id, code FROM roles WHERE code IN (?)`,
      [roleCodes]
    );
    if (roleRows.length !== roleCodes.length) {
      const found = roleRows.map((r) => r.code);
      throw new Error(`Unknown role(s). Requested: ${roleCodes.join(', ')}. Found: ${found.join(', ') || 'none'}`);
    }

    const passwordHash = await hashPassword(password);
    const mfaRequired = mfaOff ? 0 : 1;

    const [existing] = await conn.query(
      `SELECT id FROM users WHERE email = ? LIMIT 1`,
      [email]
    );

    let userIdBuf;
    let created = false;

    if (existing[0]) {
      userIdBuf = existing[0].id;
      await conn.query(
        `UPDATE users
         SET password_hash = ?,
             status = 'active',
             email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP(6)),
             mfa_required = ?,
             failed_login_count = 0,
             locked_until = NULL,
             password_changed_at = UTC_TIMESTAMP(6)
         WHERE id = ?`,
        [passwordHash, mfaRequired, userIdBuf]
      );
      console.log('Updated existing user password + status=active');
    } else {
      userIdBuf = newBinaryId();
      await conn.query(
        `INSERT INTO users (
           id, email, phone_e164, password_hash, status,
           email_verified_at, mfa_required, password_changed_at
         ) VALUES (?, ?, NULL, ?, 'active', UTC_TIMESTAMP(6), ?, UTC_TIMESTAMP(6))`,
        [userIdBuf, email, passwordHash, mfaRequired]
      );

      const profileRef = `ADM${Date.now().toString(36).toUpperCase()}`;
      await conn.query(
        `INSERT INTO customer_profiles (user_id, customer_reference, first_name, last_name)
         VALUES (?, ?, ?, ?)`,
        [userIdBuf, profileRef, firstName, lastName]
      );
      created = true;
      console.log('Created new user + profile', profileRef);
    }

    for (const role of roleRows) {
      await conn.query(
        `INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)`,
        [userIdBuf, role.id]
      );
    }

    await conn.query(
      `INSERT INTO audit_events (actor_user_id, action, target_type, target_reference, outcome, safe_metadata)
       VALUES (?, 'admin.bootstrap', 'user', ?, 'success', ?)`,
      [
        userIdBuf,
        binaryToUuid(userIdBuf),
        JSON.stringify({ email, roles: roleCodes, created, mfaRequired: !mfaOff })
      ]
    );

    await conn.commit();

    console.log('---');
    console.log('Email:   ', email);
    console.log('User ID: ', binaryToUuid(userIdBuf));
    console.log('Roles:   ', roleCodes.join(', '));
    console.log('Status:  ', 'active');
    console.log('MFA req: ', mfaOff ? 'false (--mfa-off)' : 'true');
    console.log('Sign in: ', 'https://globetrust.vercel.app/sign-in');
    console.log('Admin:   ', 'https://globetrust.vercel.app/admin');
    console.log('---');
    console.log('Done. Change this password after first login.');
  } catch (err) {
    await conn.rollback();
    console.error('Failed:', err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

main();