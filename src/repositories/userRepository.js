'use strict';

const { binaryToUuid, newBinaryId, uuidToBinary } = require('../utils/ids');

function mapUser(row) {
  if (!row) return null;
  return {
    id: binaryToUuid(row.id),
    email: row.email,
    phoneE164: row.phone_e164,
    status: row.status,
    emailVerifiedAt: row.email_verified_at,
    mfaRequired: Boolean(row.mfa_required),
    mfaEnrolledAt: row.mfa_enrolled_at,
    failedLoginCount: row.failed_login_count,
    lockedUntil: row.locked_until,
    passwordChangedAt: row.password_changed_at,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at
  };
}

function createUserRepository(pool) {
  return {
    async findByEmail(email) {
      const [rows] = await pool.query(
        `SELECT id, email, phone_e164, password_hash, status, email_verified_at,
                mfa_required, mfa_enrolled_at, failed_login_count, locked_until,
                password_changed_at, last_login_at, created_at
         FROM users WHERE email = ? LIMIT 1`,
        [email.toLowerCase()]
      );
      if (!rows[0]) return null;
      return { ...mapUser(rows[0]), passwordHash: rows[0].password_hash };
    },

    async findById(id) {
      const [rows] = await pool.query(
        `SELECT id, email, phone_e164, password_hash, status, email_verified_at,
                mfa_required, mfa_enrolled_at, failed_login_count, locked_until,
                password_changed_at, last_login_at, created_at
         FROM users WHERE id = ? LIMIT 1`,
        [uuidToBinary(id)]
      );
      if (!rows[0]) return null;
      return { ...mapUser(rows[0]), passwordHash: rows[0].password_hash };
    },

      async createCustomer({ email, passwordHash, firstName, lastName, phoneE164, status }) {
      const userId = newBinaryId();
      const profileRef = `CUS${Date.now().toString(36).toUpperCase()}`;
      const userStatus = status === 'active' ? 'active' : 'pending';
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query(
          `INSERT INTO users (id, email, phone_e164, password_hash, status, mfa_required, email_verified_at)
           VALUES (?, ?, ?, ?, ?, TRUE, ?)`,
          [
            userId,
            email.toLowerCase(),
            phoneE164 || null,
            passwordHash,
            userStatus,
            userStatus === 'active' ? new Date() : null
          ]
        );
        const [roleRows] = await conn.query(
          `SELECT id FROM roles WHERE code = 'customer' LIMIT 1`
        );
        if (roleRows[0]) {
          await conn.query(
            `INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`,
            [userId, roleRows[0].id]
          );
        }
        await conn.query(
          `INSERT INTO customer_profiles (user_id, customer_reference, first_name, last_name)
           VALUES (?, ?, ?, ?)`,
          [userId, profileRef, firstName, lastName]
        );
        await conn.commit();
        return { id: binaryToUuid(userId), customerReference: profileRef };
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    },

    async recordLoginSuccess(userId) {
      await pool.query(
        `UPDATE users
         SET failed_login_count = 0, locked_until = NULL, last_login_at = UTC_TIMESTAMP(6)
         WHERE id = ?`,
        [uuidToBinary(userId)]
      );
    },

    async recordLoginFailure(userId, maxAttempts = 5, lockMinutes = 15) {
      if (!userId) return;
      await pool.query(
        `UPDATE users
         SET failed_login_count = failed_login_count + 1,
             locked_until = CASE
               WHEN failed_login_count + 1 >= ? THEN DATE_ADD(UTC_TIMESTAMP(6), INTERVAL ? MINUTE)
               ELSE locked_until
             END
         WHERE id = ?`,
        [maxAttempts, lockMinutes, uuidToBinary(userId)]
      );
    },

    async getRoleCodes(userId) {
      const [rows] = await pool.query(
        `SELECT r.code
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = ?`,
        [uuidToBinary(userId)]
      );
      return rows.map((r) => r.code);
    },

    async updatePassword(userId, passwordHash) {
      await pool.query(
        `UPDATE users
         SET password_hash = ?, password_changed_at = UTC_TIMESTAMP(6),
             failed_login_count = 0, locked_until = NULL
         WHERE id = ?`,
        [passwordHash, uuidToBinary(userId)]
      );
    },

    async activateEmail(userId) {
      await pool.query(
        `UPDATE users
         SET email_verified_at = UTC_TIMESTAMP(6),
             status = IF(status = 'pending', 'active', status)
         WHERE id = ?`,
        [uuidToBinary(userId)]
      );
    }
  };
}

module.exports = { createUserRepository, mapUser };
