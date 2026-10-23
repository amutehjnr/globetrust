'use strict';

const { newBinaryId, uuidToBinary, binaryToUuid } = require('../utils/ids');

function createSupportRepository(pool) {
  return {
    async findOpenByCustomer(userId) {
      const [rows] = await pool.query(
        `SELECT id, status, subject, last_message_at, created_at, assigned_agent_user_id
         FROM support_conversations
         WHERE customer_user_id = ? AND status IN ('open','waiting')
         ORDER BY created_at DESC
         LIMIT 1`,
        [uuidToBinary(userId)]
      );
      if (!rows[0]) return null;
      return mapConversation(rows[0]);
    },

    async createConversation(customerUserId, subject) {
      const id = newBinaryId();
      await pool.query(
        `INSERT INTO support_conversations (id, customer_user_id, status, subject, last_message_at)
         VALUES (?, ?, 'open', ?, UTC_TIMESTAMP(6))`,
        [id, uuidToBinary(customerUserId), subject || 'Support request']
      );
      return binaryToUuid(id);
    },

    async getConversation(id) {
      const [rows] = await pool.query(
        `SELECT id, customer_user_id, assigned_agent_user_id, status, subject, last_message_at, created_at
         FROM support_conversations WHERE id = ? LIMIT 1`,
        [uuidToBinary(id)]
      );
      if (!rows[0]) return null;
      return mapConversation(rows[0]);
    },

    async listMessages(conversationId, limit = 100) {
      const [rows] = await pool.query(
        `SELECT id, sender_user_id, message_text, message_type, created_at
         FROM support_messages
         WHERE conversation_id = ?
         ORDER BY id ASC
         LIMIT ?`,
        [uuidToBinary(conversationId), limit]
      );
      return rows.map((r) => ({
        id: r.id,
        senderUserId: binaryToUuid(r.sender_user_id),
        text: r.message_text,
        type: r.message_type,
        createdAt: r.created_at
      }));
    },

    async addMessage({ conversationId, senderUserId, text }) {
      const clean = String(text || '').trim().slice(0, 2000);
      if (!clean) {
        const err = new Error('Message cannot be empty.');
        err.status = 400;
        throw err;
      }
      const [result] = await pool.query(
        `INSERT INTO support_messages (conversation_id, sender_user_id, message_text, message_type)
         VALUES (?, ?, ?, 'text')`,
        [uuidToBinary(conversationId), uuidToBinary(senderUserId), clean]
      );
      await pool.query(
        `UPDATE support_conversations
         SET last_message_at = UTC_TIMESTAMP(6), status = IF(status = 'resolved', 'open', status)
         WHERE id = ?`,
        [uuidToBinary(conversationId)]
      );
      return {
        id: result.insertId,
        senderUserId,
        text: clean,
        type: 'text',
        createdAt: new Date()
      };
    },

    async listOpenForAgents(limit = 50) {
      const [rows] = await pool.query(
        `SELECT c.id, c.status, c.subject, c.last_message_at, c.created_at,
                c.customer_user_id, c.assigned_agent_user_id,
                u.email AS customer_email, cp.first_name, cp.last_name
         FROM support_conversations c
         JOIN users u ON u.id = c.customer_user_id
         LEFT JOIN customer_profiles cp ON cp.user_id = c.customer_user_id
         WHERE c.status IN ('open','waiting')
         ORDER BY c.last_message_at DESC
         LIMIT ?`,
        [limit]
      );
      return rows.map((r) => ({
        ...mapConversation(r),
        customerEmail: r.customer_email,
        customerName: [r.first_name, r.last_name].filter(Boolean).join(' ')
      }));
    },

    async assignAgent(conversationId, agentUserId) {
      await pool.query(
        `UPDATE support_conversations
         SET assigned_agent_user_id = ?, status = 'open'
         WHERE id = ?`,
        [uuidToBinary(agentUserId), uuidToBinary(conversationId)]
      );
    },

    async setStatus(conversationId, status) {
      await pool.query(
        `UPDATE support_conversations SET status = ? WHERE id = ?`,
        [status, uuidToBinary(conversationId)]
      );
    }
  };
}

function mapConversation(r) {
  return {
    id: binaryToUuid(r.id),
    customerUserId: binaryToUuid(r.customer_user_id),
    assignedAgentUserId: r.assigned_agent_user_id
      ? binaryToUuid(r.assigned_agent_user_id)
      : null,
    status: r.status,
    subject: r.subject,
    lastMessageAt: r.last_message_at,
    createdAt: r.created_at
  };
}

module.exports = { createSupportRepository };
