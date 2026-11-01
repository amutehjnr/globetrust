'use strict';

/**
 * Create or promote a GlobeTrust admin user.
 *
 * Usage (PowerShell — one line):
 *   node scripts/create-admin.js --email admin@example.com --password "YourStrongPass1" --mfa-off
 *
 * Env (same as the app):
 *   MYSQL_HOST, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD
 *   MYSQL_PORT (optional, default 3306)
 *   or DATABASE_URL
 *
 * Optional env:
 *   ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME
 */

require('dotenv').config();

const mysql = require('mysql2/promise');
const argon2 = require('argon2');
const crypto = require('node:crypto');

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1
};

function parseArgs(argv) {
  const out = {
    email: process.env.ADMIN_EMAIL || '',
    password: process.env.ADMIN_PASSWORD || '',
    name: process.env.ADMIN_NAME || 'Admin User',
    mfaOff: false,
    promoteOnly: false
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--email' && argv[i + 1]) {
      out.email = argv[++i];
    } else if (a === '--password' && argv[i + 1]) {
      out.password = argv[++i];
    } else if (a === '--name' && argv[i + 1]) {
      out.name = argv[++i];
    } else if (a === '--mfa-off') {
      out.mfaOff = true;
    } else if (a === '--promote-only') {
      out.promoteOnly = true;
    } else if (a === '--help' || a === '-h') {
      console.log(`
Usage:
  node scripts/create-admin.js --email admin@example.com --password "YourStrongPass1" --mfa-off

Options:
  --email <email>       Admin email (required)
  --password <pass>     Min 12 chars, upper + lower + digit (required unless --promote-only)
  --name "Full Name"    Display name (default: Admin User)
  --mfa-off             Set mfa_required = FALSE for easier first login
  --promote-only        Only assign admin role to an existing user

Required env (same as app):
  MYSQL_HOST, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD
  MYSQL_PORT (optional)
  or DATABASE_URL
`);
      process.exit(0);
    }
  }
  return out;
}

function uuidToBinary(uuid) {
  const hex = String(uuid).replace(/-/g, '');
  return Buffer.from(hex, 'hex');
}

function binaryToUuid(buf) {
  const hex = Buffer.from(buf).toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join('-');
}

function newBinaryId() {
  return uuidToBinary(crypto.randomUUID());
}

function createPool() {
  if (process.env.DATABASE_URL) {
    console.log('Connecting via DATABASE_URL');
    return mysql.createPool({
      uri: process.env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 2
    });
  }

  // Match src/config/database.js
  const host = process.env.MYSQL_HOST || process.env.DB_HOST;
  const database = process.env.MYSQL_DATABASE || process.env.DB_NAME;
  const user = process.env.MYSQL_USER || process.env.DB_USER;
  const password = process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '';
  const port = Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306);

  if (!host || !database || !user) {
    throw new Error(
      'Missing DB config. Set MYSQL_HOST, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD ' +
        '(or DATABASE_URL) in .env — same variables the app uses.'
    );
  }

  console.log(`Connecting to ${host}:${port} / database=${database} as ${user}`);

  return mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 2,
    charset: 'utf8mb4',
    timezone: 'Z'
  });
}

async function ensureAdminRole(conn) {
  const [rows] = await conn.query(
    `SELECT id, code FROM roles WHERE code = 'admin' LIMIT 1`
  );
  if (rows[0]) return rows[0].id;

  // roles.id may be auto-increment or fixed seed — try insert by code only
  try {
    await conn.query(
      `INSERT INTO roles (code, description) VALUES ('admin', 'Full administrator')`
    );
  } catch (err) {
    // If schema requires more columns or role already raced in, re-select
    if (err.code !== 'ER_DUP_ENTRY') {
      // try with common seed-style columns if present
      try {
        await conn.query(
          `INSERT IGNORE INTO roles (code, description) VALUES ('admin', 'Full administrator')`
        );
      } catch (_) {
        throw new Error(
          'Could not ensure admin role. Seed roles from schema.sql first. ' +
            (err.message || '')
        );
      }
    }
  }

  const [again] = await conn.query(
    `SELECT id FROM roles WHERE code = 'admin' LIMIT 1`
  );
  if (!again[0]) {
    throw new Error(
      "Role 'admin' not found. Run your schema/seed so the roles table has code='admin'."
    );
  }
  return again[0].id;
}

async function main() {
  const args = parseArgs(process.argv);
  const email = String(args.email || '').trim().toLowerCase();
  const password = String(args.password || '');
  const nameParts = String(args.name || 'Admin User').trim().split(/\s+/);
  const firstName = nameParts[0] || 'Admin';
  const lastName = nameParts.slice(1).join(' ') || 'User';

  if (!email || !email.includes('@')) {
    console.error('Error: --email is required (valid email).');
    process.exit(1);
  }

  if (!args.promoteOnly) {
    if (password.length < 12) {
      console.error('Error: password must be at least 12 characters.');
      process.exit(1);
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      console.error('Error: password needs uppercase, lowercase, and a digit.');
      process.exit(1);
    }
  }

  let pool;
  try {
    pool = createPool();
  } catch (err) {
    console.error('Failed:', err.message || err);
    process.exit(1);
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const roleId = await ensureAdminRole(conn);

    const [existing] = await conn.query(
      `SELECT id, email, status FROM users WHERE email = ? LIMIT 1`,
      [email]
    );

    let userIdBin;
    let userIdStr;
    let created = false;

    if (existing[0]) {
      userIdBin = existing[0].id;
      userIdStr = binaryToUuid(userIdBin);

      if (!args.promoteOnly && password) {
        const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);
        await conn.query(
          `UPDATE users
           SET password_hash = ?,
               status = 'active',
               email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP(6)),
               mfa_required = ?,
               failed_login_count = 0,
               locked_until = NULL
           WHERE id = ?`,
          [passwordHash, args.mfaOff ? 0 : 1, userIdBin]
        );
      } else {
        await conn.query(
          `UPDATE users
           SET status = 'active',
               email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP(6)),
               mfa_required = IF(?, 0, mfa_required),
               failed_login_count = 0,
               locked_until = NULL
           WHERE id = ?`,
          [args.mfaOff ? 1 : 0, userIdBin]
        );
      }

      console.log(`Found existing user: ${email} (${userIdStr})`);
    } else {
      if (args.promoteOnly) {
        throw new Error(`User ${email} does not exist; remove --promote-only to create.`);
      }

      userIdBin = newBinaryId();
      userIdStr = binaryToUuid(userIdBin);
      const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);

      await conn.query(
        `INSERT INTO users (
           id, email, password_hash, status, mfa_required, email_verified_at
         ) VALUES (?, ?, ?, 'active', ?, UTC_TIMESTAMP(6))`,
        [userIdBin, email, passwordHash, args.mfaOff ? 0 : 1]
      );

      const ref = `ADM${Date.now().toString(36).toUpperCase()}`;
      await conn.query(
        `INSERT INTO customer_profiles (user_id, customer_reference, first_name, last_name)
         VALUES (?, ?, ?, ?)`,
        [userIdBin, ref, firstName, lastName]
      );

      created = true;
      console.log(`Created user: ${email} (${userIdStr})`);
    }

    const [hasRole] = await conn.query(
      `SELECT 1 FROM user_roles WHERE user_id = ? AND role_id = ? LIMIT 1`,
      [userIdBin, roleId]
    );
    if (!hasRole[0]) {
      await conn.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`,
        [userIdBin, roleId]
      );
      console.log('Assigned role: admin');
    } else {
      console.log('Role admin already assigned');
    }

    await conn.commit();

    console.log('');
    console.log('Done.');
    console.log(`  Email:    ${email}`);
    console.log(`  User ID:  ${userIdStr}`);
    console.log(`  Created:  ${created}`);
    console.log(
      `  MFA req:  ${args.mfaOff ? 'OFF' : 'ON (enrol after first login if needed)'}`
    );
    console.log('');
    console.log('Sign in at /sign-in then open /admin');
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {}
    console.error('Failed:', err.message || err);
    if (err.code === 'ER_BAD_DB_ERROR') {
      console.error(
        'Hint: MYSQL_DATABASE does not exist. Create the database and import schema.sql, or fix the name in .env.'
      );
    }
    if (err.code === 'ECONNREFUSED') {
      console.error('Hint: MySQL is not reachable at MYSQL_HOST/MYSQL_PORT.');
    }
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

main();