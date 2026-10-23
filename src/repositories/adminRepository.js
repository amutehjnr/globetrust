'use strict';

const { uuidToBinary, binaryToUuid } = require('../utils/ids');

function createAdminRepository(pool) {
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
      const counts = await this.counts();

      const [userStatusRows] = await pool.query(
        `SELECT status, COUNT(*) AS c FROM users GROUP BY status`
      );
      const usersByStatus = Object.fromEntries(
        userStatusRows.map((r) => [r.status, Number(r.c)])
      );

      const [kycStatusRows] = await pool.query(
        `SELECT verification_status AS status, COUNT(*) AS c
         FROM kyc_documents WHERE deleted_at IS NULL
         GROUP BY verification_status`
      );
      const kycByStatus = Object.fromEntries(
        kycStatusRows.map((r) => [r.status, Number(r.c)])
      );

      const [txStatusRows] = await pool.query(
        `SELECT status, COUNT(*) AS c FROM transaction_requests GROUP BY status`
      );
      const transfersByStatus = Object.fromEntries(
        txStatusRows.map((r) => [r.status, Number(r.c)])
      );

      const [[openSupport]] = await pool.query(
        `SELECT COUNT(*) AS c FROM support_conversations WHERE status IN ('open','waiting')`
      );

      const [[txLast7]] = await pool.query(
        `SELECT COUNT(*) AS c FROM transaction_requests
         WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 7 DAY)`
      );

      // Last 7 days registration counts for simple bar chart
      const [regDaily] = await pool.query(
        `SELECT DATE(created_at) AS d, COUNT(*) AS c
         FROM users
         WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 6 DAY)
         GROUP BY DATE(created_at)
         ORDER BY d ASC`
      );

      const dayMap = Object.fromEntries(
        regDaily.map((r) => [String(r.d).slice(0, 10), Number(r.c)])
      );
      const registrationsLast7 = [];
      for (let i = 6; i >= 0; i--) {
        const dt = new Date();
        dt.setUTCDate(dt.getUTCDate() - i);
        const key = dt.toISOString().slice(0, 10);
        registrationsLast7.push({ date: key, count: dayMap[key] || 0 });
      }

      const pendingKycPreview = await this.listPendingKyc(8);

      return {
        counts: {
          ...counts,
          openSupport: Number(openSupport.c),
          transfersLast7Days: Number(txLast7.c)
        },
        usersByStatus,
        kycByStatus,
        transfersByStatus,
        registrationsLast7,
        pendingKycPreview
      };
    },

    async searchCustomers(q, limit = 25) {
      const like = `%${q}%`;
      const [rows] = await pool.query(
        `SELECT u.id, u.email, u.status, u.created_at,
                cp.customer_reference, cp.first_name, cp.last_name
         FROM users u
         LEFT JOIN customer_profiles cp ON cp.user_id = u.id
         WHERE u.email LIKE ? OR cp.customer_reference LIKE ?
            OR cp.first_name LIKE ? OR cp.last_name LIKE ?
         ORDER BY u.created_at DESC
         LIMIT ?`,
        [like, like, like, like, limit]
      );
      return rows.map((r) => ({
        id: binaryToUuid(r.id),
        email: r.email,
        status: r.status,
        createdAt: r.created_at,
        customerReference: r.customer_reference,
        firstName: r.first_name,
        lastName: r.last_name
      }));
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
      await pool.query(
        `INSERT INTO audit_events (actor_user_id, action, target_type, target_reference, outcome, safe_metadata)
         VALUES (?, ?, 'kyc_document', ?, 'success', ?)`,
        [
          uuidToBinary(reviewerUserId),
          status === 'approved' ? 'kyc.approve' : 'kyc.reject',
          documentId,
          JSON.stringify({ status, reason: reason ? String(reason).slice(0, 500) : null })
        ]
      );
      return { ok: true, status };
    }
  };
}

module.exports = { createAdminRepository };
