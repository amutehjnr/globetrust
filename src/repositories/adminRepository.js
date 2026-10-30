'use strict';

const { uuidToBinary, binaryToUuid, newBinaryId } = require('../utils/ids');

function createAdminRepository(pool) {
  async function writeAudit(actorUserId, action, targetType, targetReference, metadata) {
    try {
      await pool.query(
        `INSERT INTO audit_events (actor_user_id, action, target_type, target_reference, outcome, safe_metadata)
         VALUES (?, ?, ?, ?, 'success', ?)`,
        [
          actorUserId ? uuidToBinary(actorUserId) : null,
          action,
          targetType,
          String(targetReference || '').slice(0, 128),
          JSON.stringify(metadata || {})
        ]
      );
    } catch (_) {
      // best-effort
    }
  }

  return {
    async counts() {
      const [[users]] = await pool.query(`SELECT COUNT(*) AS c FROM users`);
      const [[pendingKyc]] = await pool.query(
        `SELECT COUNT(*) AS c FROM kyc_documents WHERE verification_status = 'pending' AND deleted_at IS NULL`
      );
      const [[activeLinks]] = await pool.query(
        `SELECT COUNT(*) AS c FROM bank_account_links WHERE link_status = 'active'`
      );
      return {
        users: users.c,
        pendingKyc: pendingKyc.c,
        activeAccountLinks: activeLinks.c
      };
    },

    async dashboardStats() {
      const safeQuery = async (sql, params = []) => {
        try {
          return await pool.query(sql, params);
        } catch {
          return [[]];
        }
      };
      const safeCount = async (sql, params = []) => {
        try {
          const [[row]] = await pool.query(sql, params);
          return Number(row?.c || 0);
        } catch {
          return 0;
        }
      };

      let counts = { users: 0, pendingKyc: 0, activeAccountLinks: 0 };
      try {
        counts = await this.counts();
      } catch {
        counts.users = await safeCount(`SELECT COUNT(*) AS c FROM users`);
      }

      const [userStatusRows] = await safeQuery(
        `SELECT status, COUNT(*) AS c FROM users GROUP BY status`
      );
      const usersByStatus = Object.fromEntries(
        (userStatusRows || []).map((r) => [r.status, Number(r.c)])
      );

      const [kycStatusRows] = await safeQuery(
        `SELECT verification_status AS status, COUNT(*) AS c
         FROM kyc_documents WHERE deleted_at IS NULL
         GROUP BY verification_status`
      );
      const kycByStatus = Object.fromEntries(
        (kycStatusRows || []).map((r) => [r.status, Number(r.c)])
      );

      const [txStatusRows] = await safeQuery(
        `SELECT status, COUNT(*) AS c FROM transaction_requests GROUP BY status`
      );
      const transfersByStatus = Object.fromEntries(
        (txStatusRows || []).map((r) => [r.status, Number(r.c)])
      );

      const openSupport = await safeCount(
        `SELECT COUNT(*) AS c FROM support_conversations WHERE status IN ('open','waiting')`
      );
      const txLast7 = await safeCount(
        `SELECT COUNT(*) AS c FROM transaction_requests
         WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 7 DAY)`
      );
      const pendingApprovals = await safeCount(
        `SELECT COUNT(*) AS c FROM admin_approvals WHERE status = 'pending'`
      );

      const [regDaily] = await safeQuery(
        `SELECT DATE(created_at) AS d, COUNT(*) AS c
         FROM users
         WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 6 DAY)
         GROUP BY DATE(created_at)
         ORDER BY d ASC`
      );

      const dayMap = Object.fromEntries(
        (regDaily || []).map((r) => [String(r.d).slice(0, 10), Number(r.c)])
      );
      const registrationsLast7 = [];
      for (let i = 6; i >= 0; i--) {
        const dt = new Date();
        dt.setUTCDate(dt.getUTCDate() - i);
        const key = dt.toISOString().slice(0, 10);
        registrationsLast7.push({ date: key, count: dayMap[key] || 0 });
      }

      let pendingKycPreview = [];
      try {
        pendingKycPreview = await this.listPendingKyc(8);
      } catch {
        pendingKycPreview = [];
      }

      return {
        counts: {
          ...counts,
          openSupport,
          transfersLast7Days: txLast7,
          pendingApprovals
        },
        usersByStatus,
        kycByStatus,
        transfersByStatus,
        registrationsLast7,
        pendingKycPreview
      };
    },

    async searchCustomers(q, limit = 25, filters = {}) {
      const clauses = [];
      const params = [];
      if (q && String(q).trim().length >= 1) {
        const like = `%${String(q).trim()}%`;
        clauses.push(
          `(u.email LIKE ? OR cp.customer_reference LIKE ? OR cp.first_name LIKE ? OR cp.last_name LIKE ?)`
        );
        params.push(like, like, like, like);
      }
      if (filters.status) {
        clauses.push('u.status = ?');
        params.push(filters.status);
      }
      if (filters.countryCode) {
        clauses.push('cp.country_code = ?');
        params.push(String(filters.countryCode).toUpperCase().slice(0, 2));
      }
      if (filters.kycStatus) {
        clauses.push(
          `EXISTS (
            SELECT 1 FROM kyc_documents k
            WHERE k.user_id = u.id AND k.deleted_at IS NULL AND k.verification_status = ?
          )`
        );
        params.push(filters.kycStatus);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const [rows] = await pool.query(
        `SELECT u.id, u.email, u.status, u.created_at, u.mfa_enrolled_at, u.last_login_at,
                cp.customer_reference, cp.first_name, cp.last_name, cp.country_code
         FROM users u
         LEFT JOIN customer_profiles cp ON cp.user_id = u.id
         ${where}
         ORDER BY u.created_at DESC
         LIMIT ?`,
        [...params, Number(limit) || 25]
      );
      return rows.map((r) => ({
        id: binaryToUuid(r.id),
        email: r.email,
        status: r.status,
        createdAt: r.created_at,
        mfaEnrolledAt: r.mfa_enrolled_at,
        lastLoginAt: r.last_login_at,
        customerReference: r.customer_reference,
        firstName: r.first_name,
        lastName: r.last_name,
        countryCode: r.country_code
      }));
    },

    async listRecentCustomers(limit = 25) {
      return this.searchCustomers('', limit, {});
    },

    async setUserStatus(userId, status, actorUserId) {
      const allowed = ['pending', 'active', 'locked', 'suspended', 'closed'];
      if (!allowed.includes(status)) {
        const err = new Error('Invalid user status.');
        err.status = 400;
        throw err;
      }
      await pool.query(`UPDATE users SET status = ? WHERE id = ?`, [
        status,
        uuidToBinary(userId)
      ]);
      await writeAudit(actorUserId, 'user.status_change', 'user', userId, { status });
      return { ok: true, status };
    },

    async forcePasswordResetFlag(userId, actorUserId) {
      await pool.query(
        `UPDATE users
         SET password_changed_at = NULL,
             failed_login_count = 0,
             locked_until = NULL
         WHERE id = ?`,
        [uuidToBinary(userId)]
      );
      await writeAudit(actorUserId, 'user.force_password_reset', 'user', userId, {});
      return { ok: true };
    },

    async getUserRoles(userId) {
      const [rows] = await pool.query(
        `SELECT r.code, r.description
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = ?
         ORDER BY r.code`,
        [uuidToBinary(userId)]
      );
      return rows.map((r) => ({ code: r.code, description: r.description }));
    },

    async setUserRoles(userId, roleCodes, actorUserId) {
      const codes = Array.isArray(roleCodes)
        ? roleCodes.map((c) => String(c).trim()).filter(Boolean)
        : [];
      const [roleRows] = await pool.query(
        `SELECT id, code FROM roles WHERE code IN (${codes.length ? codes.map(() => '?').join(',') : "''"})`,
        codes
      );
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query(`DELETE FROM user_roles WHERE user_id = ?`, [uuidToBinary(userId)]);
        for (const r of roleRows) {
          await conn.query(
            `INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, ?)`,
            [uuidToBinary(userId), r.id, actorUserId ? uuidToBinary(actorUserId) : null]
          );
        }
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
      await writeAudit(actorUserId, 'user.roles_set', 'user', userId, {
        roles: roleRows.map((r) => r.code)
      });
      return { ok: true, roles: roleRows.map((r) => r.code) };
    },

    async listAllRoles() {
      const [rows] = await pool.query(
        `SELECT code, description FROM roles ORDER BY id`
      );
      return rows.map((r) => ({ code: r.code, description: r.description }));
    },

    async listTransfers({ status, q, limit = 50 } = {}) {
      const clauses = [];
      const params = [];
      if (status) {
        clauses.push('t.status = ?');
        params.push(status);
      }
      if (q && String(q).trim().length >= 2) {
        const like = `%${String(q).trim()}%`;
        clauses.push(
          `(u.email LIKE ? OR t.external_reference LIKE ? OR cp.customer_reference LIKE ?)`
        );
        params.push(like, like, like);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const [rows] = await pool.query(
        `SELECT t.id, t.user_id, t.status, t.source_amount, t.source_currency,
                t.destination_currency, t.external_reference, t.failure_code,
                t.created_at, t.completed_at, u.email,
                cp.first_name, cp.last_name, cp.customer_reference
         FROM transaction_requests t
         JOIN users u ON u.id = t.user_id
         LEFT JOIN customer_profiles cp ON cp.user_id = t.user_id
         ${where}
         ORDER BY t.created_at DESC
         LIMIT ?`,
        [...params, Math.min(Number(limit) || 50, 200)]
      );
      return rows.map((r) => ({
        id: binaryToUuid(r.id),
        userId: binaryToUuid(r.user_id),
        status: r.status,
        sourceAmount: r.source_amount,
        sourceCurrency: r.source_currency,
        destinationCurrency: r.destination_currency,
        externalReference: r.external_reference,
        failureCode: r.failure_code,
        createdAt: r.created_at,
        completedAt: r.completed_at,
        email: r.email,
        firstName: r.first_name,
        lastName: r.last_name,
        customerReference: r.customer_reference
      }));
    },

    async updateTransferStatus(transferId, status, actorUserId, reason) {
      const allowed = [
        'created',
        'pending_approval',
        'submitted',
        'processing',
        'succeeded',
        'failed',
        'reversed',
        'unknown'
      ];
      if (!allowed.includes(status)) {
        const err = new Error('Invalid transfer status.');
        err.status = 400;
        throw err;
      }
      await pool.query(
        `UPDATE transaction_requests
         SET status = ?,
             completed_at = IF(? IN ('succeeded','failed','reversed'), UTC_TIMESTAMP(6), completed_at)
         WHERE id = ?`,
        [status, status, uuidToBinary(transferId)]
      );
      try {
        await pool.query(
          `INSERT INTO transaction_events (transaction_request_id, event_type, safe_metadata)
           VALUES (?, 'admin_status_change', ?)`,
          [
            uuidToBinary(transferId),
            JSON.stringify({ status, reason: reason || null, by: actorUserId })
          ]
        );
      } catch (_) {}
      await writeAudit(actorUserId, 'transfer.status_change', 'transfer', transferId, {
        status,
        reason: reason || null
      });
      return { ok: true, status };
    },

    async getLoginActivity(userId, limit = 30) {
      try {
        const [rows] = await pool.query(
          `SELECT id, success, failure_reason, ip_address, user_agent, created_at
           FROM login_events
           WHERE user_id = ?
           ORDER BY id DESC
           LIMIT ?`,
          [uuidToBinary(userId), Math.min(Number(limit) || 30, 100)]
        );
        return rows.map((r) => ({
          id: r.id,
          success: Boolean(r.success),
          failureReason: r.failure_reason,
          ipAddress: r.ip_address,
          userAgent: r.user_agent,
          createdAt: r.created_at
        }));
      } catch (err) {
        if (err && err.code === 'ER_NO_SUCH_TABLE') return [];
        throw err;
      }
    },

    async createNotification({ userId, type, title, body }) {
      const id = newBinaryId();
      await pool.query(
        `INSERT INTO notifications (id, user_id, notification_type, title, body)
         VALUES (?, ?, ?, ?, ?)`,
        [
          id,
          uuidToBinary(userId),
          String(type || 'admin').slice(0, 60),
          String(title).slice(0, 160),
          String(body).slice(0, 1000)
        ]
      );
      return { id: binaryToUuid(id) };
    },

    async listStaffUsers() {
      const [rows] = await pool.query(
        `SELECT u.id, u.email, u.status, u.created_at, u.last_login_at,
                GROUP_CONCAT(r.code ORDER BY r.code SEPARATOR ',') AS roles
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id
         WHERE r.code IN ('admin','support_agent','kyc_reviewer','operations','auditor')
         GROUP BY u.id, u.email, u.status, u.created_at, u.last_login_at
         ORDER BY u.created_at DESC`
      );
      return rows.map((r) => ({
        id: binaryToUuid(r.id),
        email: r.email,
        status: r.status,
        createdAt: r.created_at,
        lastLoginAt: r.last_login_at,
        roles: r.roles ? String(r.roles).split(',') : []
      }));
    },

    async createStaffUser({
      email,
      passwordHash,
      roleCodes,
      firstName,
      lastName,
      actorUserId
    }) {
      const userId = newBinaryId();
      const codes = Array.isArray(roleCodes) && roleCodes.length
        ? roleCodes
        : ['support_agent'];
      const [roleRows] = await pool.query(
        `SELECT id, code FROM roles WHERE code IN (${codes.map(() => '?').join(',')})`,
        codes
      );
      if (!roleRows.length) {
        const err = new Error('No valid staff roles selected.');
        err.status = 400;
        throw err;
      }
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query(
          `INSERT INTO users (id, email, password_hash, status, mfa_required, email_verified_at)
           VALUES (?, ?, ?, 'active', TRUE, UTC_TIMESTAMP(6))`,
          [userId, email.toLowerCase(), passwordHash]
        );
        for (const r of roleRows) {
          await conn.query(
            `INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, ?)`,
            [userId, r.id, actorUserId ? uuidToBinary(actorUserId) : null]
          );
        }
        // Optional profile row for display name
        const ref = `STF${Date.now().toString(36).toUpperCase()}`;
        await conn.query(
          `INSERT INTO customer_profiles (user_id, customer_reference, first_name, last_name)
           VALUES (?, ?, ?, ?)`,
          [userId, ref, firstName || 'Staff', lastName || 'User']
        );
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
      const id = binaryToUuid(userId);
      await writeAudit(actorUserId, 'staff.create', 'user', id, {
        email,
        roles: roleRows.map((r) => r.code)
      });
      return { id, roles: roleRows.map((r) => r.code) };
    },

    async reportSummary() {
      const safeCount = async (sql, params = []) => {
        try {
          const [[row]] = await pool.query(sql, params);
          return Number(row?.c || 0);
        } catch {
          return 0;
        }
      };
      const safeQuery = async (sql, params = []) => {
        try {
          return await pool.query(sql, params);
        } catch {
          return [[]];
        }
      };

      const registrationsToday = await safeCount(
        `SELECT COUNT(*) AS c FROM users WHERE DATE(created_at) = UTC_DATE()`
      );
      const registrations7d = await safeCount(
        `SELECT COUNT(*) AS c FROM users
         WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 7 DAY)`
      );
      const transfers7d = await safeCount(
        `SELECT COUNT(*) AS c FROM transaction_requests
         WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 7 DAY)`
      );
      const transferVolume7d = await safeCount(
        `SELECT COALESCE(SUM(source_amount),0) AS c FROM transaction_requests
         WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 7 DAY)
           AND status IN ('succeeded','processing','submitted')`
      );
      const kycPending = await safeCount(
        `SELECT COUNT(*) AS c FROM kyc_documents
         WHERE verification_status = 'pending' AND deleted_at IS NULL`
      );
      const kycApproved7d = await safeCount(
        `SELECT COUNT(*) AS c FROM kyc_documents
         WHERE verification_status = 'approved'
           AND reviewed_at >= DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 7 DAY)`
      );

      const [txByStatus] = await safeQuery(
        `SELECT status, COUNT(*) AS c FROM transaction_requests
         WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 7 DAY)
         GROUP BY status`
      );
      const [regDaily] = await safeQuery(
        `SELECT DATE(created_at) AS d, COUNT(*) AS c FROM users
         WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 13 DAY)
         GROUP BY DATE(created_at) ORDER BY d ASC`
      );

      return {
        registrationsToday,
        registrations7d,
        transfers7d,
        transferVolume7d,
        kycPending,
        kycApproved7d,
        transfersByStatus: Object.fromEntries(
          (txByStatus || []).map((r) => [r.status, Number(r.c)])
        ),
        registrationsDaily: (regDaily || []).map((r) => ({
          date: String(r.d).slice(0, 10),
          count: Number(r.c)
        }))
      };
    },

    async listPendingApprovals(limit = 50) {
      const [rows] = await pool.query(
        `SELECT a.id, a.action_type, a.target_reference, a.reason, a.status,
                a.requested_at, a.decided_at,
                req.email AS requester_email,
                appr.email AS approver_email
         FROM admin_approvals a
         LEFT JOIN users req ON req.id = a.requested_by
         LEFT JOIN users appr ON appr.id = a.approved_by
         WHERE a.status = 'pending'
         ORDER BY a.requested_at ASC
         LIMIT ?`,
        [Math.min(Number(limit) || 50, 100)]
      );
      return rows.map((r) => ({
        id: binaryToUuid(r.id),
        actionType: r.action_type,
        targetReference: r.target_reference,
        reason: r.reason,
        status: r.status,
        requestedAt: r.requested_at,
        decidedAt: r.decided_at,
        requesterEmail: r.requester_email,
        approverEmail: r.approver_email
      }));
    },

    async createApproval({ actionType, targetReference, reason, requestedBy }) {
      const id = newBinaryId();
      await pool.query(
        `INSERT INTO admin_approvals (id, action_type, target_reference, requested_by, status, reason)
         VALUES (?, ?, ?, ?, 'pending', ?)`,
        [
          id,
          String(actionType).slice(0, 80),
          String(targetReference).slice(0, 128),
          uuidToBinary(requestedBy),
          String(reason || '').slice(0, 500)
        ]
      );
      return { id: binaryToUuid(id) };
    },

    async decideApproval({ approvalId, decision, approvedBy, reason }) {
      if (!['approved', 'rejected'].includes(decision)) {
        const err = new Error('Decision must be approved or rejected.');
        err.status = 400;
        throw err;
      }
      const [result] = await pool.query(
        `UPDATE admin_approvals
         SET status = ?, approved_by = ?, decided_at = UTC_TIMESTAMP(6),
             reason = COALESCE(?, reason)
         WHERE id = ? AND status = 'pending'`,
        [
          decision,
          uuidToBinary(approvedBy),
          reason ? String(reason).slice(0, 500) : null,
          uuidToBinary(approvalId)
        ]
      );
      if (!result.affectedRows) {
        const err = new Error('Approval not found or already decided.');
        err.status = 409;
        throw err;
      }
      await writeAudit(approvedBy, `approval.${decision}`, 'approval', approvalId, {
        decision,
        reason: reason || null
      });
      return { ok: true, status: decision };
    },

    async listPendingKyc(limit = 50) {
      const [rows] = await pool.query(
        `SELECT k.id, k.document_type, k.verification_status, k.created_at, k.storage_provider,
                u.email, cp.customer_reference, cp.first_name, cp.last_name, k.user_id
         FROM kyc_documents k
         JOIN users u ON u.id = k.user_id
         LEFT JOIN customer_profiles cp ON cp.user_id = k.user_id
         WHERE k.verification_status = 'pending' AND k.deleted_at IS NULL
         ORDER BY k.created_at ASC
         LIMIT ?`,
        [limit]
      );
      return rows.map((r) => ({
        id: binaryToUuid(r.id),
        userId: binaryToUuid(r.user_id),
        documentType: r.document_type,
        verificationStatus: r.verification_status,
        createdAt: r.created_at,
        storageProvider: r.storage_provider,
        email: r.email,
        customerReference: r.customer_reference,
        firstName: r.first_name,
        lastName: r.last_name
      }));
    },

    async reviewKyc({ documentId, reviewerUserId, status, reason }) {
      if (!['approved', 'rejected'].includes(status)) {
        const err = new Error('Invalid review decision. Use approve or reject.');
        err.status = 400;
        throw err;
      }
      if (status === 'rejected' && reason && String(reason).length > 500) {
        const err = new Error('Rejection reason must be 500 characters or fewer.');
        err.status = 400;
        throw err;
      }
      const [result] = await pool.query(
        `UPDATE kyc_documents
         SET verification_status = ?, reviewer_user_id = ?, reviewed_at = UTC_TIMESTAMP(6)
         WHERE id = ? AND verification_status = 'pending' AND deleted_at IS NULL`,
        [status, uuidToBinary(reviewerUserId), uuidToBinary(documentId)]
      );
      if (!result.affectedRows) {
        const err = new Error('This document is not pending or was already reviewed.');
        err.status = 409;
        throw err;
      }
      await writeAudit(
        reviewerUserId,
        status === 'approved' ? 'kyc.approve' : 'kyc.reject',
        'kyc_document',
        documentId,
        { status, reason: reason ? String(reason).slice(0, 500) : null }
      );
      return { ok: true, status };
    }
  };
}

module.exports = { createAdminRepository };