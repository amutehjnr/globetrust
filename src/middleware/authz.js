'use strict';

function requireAuth(req, res, next) {
  if (!req.session?.user?.id) {
    if (req.accepts('html')) {
      return res.redirect('/sign-in?next=' + encodeURIComponent(req.originalUrl));
    }
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    const userRoles = req.session?.user?.roles || [];
    const ok = roles.some((r) => userRoles.includes(r));
    if (!ok) {
      if (req.accepts('html')) {
        return res.status(403).render('errors/403', { title: 'Access denied' });
      }
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

/**
 * Block sensitive actions until TOTP MFA is enrolled.
 * Staff roles can be exempted only when MFA_ENFORCE_STAFF=false (default: enforced for everyone).
 */
function requireMfaEnrolled(mfaService) {
  return async (req, res, next) => {
    try {
      if (!req.session?.user?.id) {
        return res.redirect('/sign-in');
      }
      const status = await mfaService.getStatus(req.session.user.id);
      if (status.enrolled) {
        return next();
      }
      if (req.accepts('html')) {
        req.session.mustEnrollMfa = true;
        return res.redirect('/mfa/enrol?next=' + encodeURIComponent(req.originalUrl));
      }
      return res.status(403).json({
        error: 'mfa_required',
        message: 'Multi-factor authentication must be enabled before this action.'
      });
    } catch (err) {
      next(err);
    }
  };
}

function attachUserLocals(req, res, next) {
  res.locals.currentUser = req.session?.user || null;
  next();
}

module.exports = {
  requireAuth,
  requireRole,
  requireMfaEnrolled,
  attachUserLocals
};
