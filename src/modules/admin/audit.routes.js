'use strict';

const express = require('express');
const { requireAuth, requireRole } = require('../../middleware/authz');

function createAuditRouter({ auditRepo }) {
  const router = express.Router();

  router.get(
    '/admin/audit',
    requireAuth,
    requireRole('admin', 'auditor', 'operations'),
    async (req, res, next) => {
      try {
        const action = (req.query.action || '').trim();
        const outcome = (req.query.outcome || '').trim();
        const events = await auditRepo.search({
          action: action || undefined,
          outcome: outcome || undefined,
          limit: 100
        });
        res.render('admin/audit', {
          title: 'Audit events',
          path: '/admin/audit',
          events,
          action,
          outcome
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

module.exports = { createAuditRouter };
