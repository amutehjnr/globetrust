'use strict';

const { binaryToUuid } = require('../utils/ids');

function createAuditRepository(pool) {
  return {
    async search({ action, outcome, limit = 50 }) {
      const clauses = [];
      const params = [];
      if (action) {
        clauses.push('action LIKE ?');
        params.push(`%${action}%`);
      }
      if (outcome) {
        clauses.push('outcome = ?');
        params.push(outcome);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const [rows] = await pool.query(
        `SELECT id, actor_user_id, action, target_type, target_reference, outcome,
                request_id, user_agent_summary, safe_metadata, created_at
         FROM audit_events
         ${where}
         ORDER BY id DESC
         LIMIT ?`,
        [...params, Math.min(Number(limit) || 50, 200)]
      );
      return rows.map((r) => ({
        id: r.id,
        actorUserId: r.actor_user_id ? binaryToUuid(r.actor_user_id) : null,
        action: r.action,
        targetType: r.target_type,
        targetReference: r.target_reference,
        outcome: r.outcome,
        requestId: r.request_id,
        userAgentSummary: r.user_agent_summary,
        safeMetadata: r.safe_metadata,
        createdAt: r.created_at
      }));
    }
  };
}

module.exports = { createAuditRepository };
