'use strict';

const { hashPassword, verifyPassword } = require('../utils/password');
const { randomToken } = require('../utils/ids');

function createAuthService({ userRepo, tokenRepo, logger, emailService }) {
  const GENERIC_AUTH_ERROR = 'Invalid email or password.';
  const MAX_ATTEMPTS = 5;
  const LOCK_MINUTES = 15;

  return {
    async register(input) {
      const existing = await userRepo.findByEmail(input.email);
      if (existing) {
        const err = new Error('If this email is available, a verification step will follow.');
        // Avoid account enumeration: same message style; still don't create duplicate
        err.status = 409;
        err.code = 'EMAIL_TAKEN';
        throw err;
      }
        const passwordHash = await hashPassword(input.password);
        const created = await userRepo.createCustomer({
          email: input.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          phoneE164: input.phoneE164 || null,
          countryCode: input.countryCode && input.countryCode !== 'OTHER'
            ? input.countryCode
            : null
        });
        const userId = created.id || created;
        logger.info({ userId }, 'Customer registered (pending verification)');

        // Welcome email via Resend (best-effort)
        if (emailService?.sendWelcome) {
          const name = [input.firstName, input.lastName].filter(Boolean).join(' ') || undefined;
          emailService
            .sendWelcome({ to: input.email, customerName: name })
            .catch((err) => logger.error({ err, userId }, 'Welcome email failed'));
        }

        return { userId, status: 'pending' };
    },

    async login({ email, password, ip, userAgent }) {
      const user = await userRepo.findByEmail(email);

      if (!user || !user.passwordHash) {
        await tokenRepo.logLoginEvent({
          userId: null,
          emailAttempt: email,
          success: false,
          failureReason: 'unknown_user',
          ip,
          userAgent
        });
        const err = new Error(GENERIC_AUTH_ERROR);
        err.status = 401;
        throw err;
      }

      if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
        await tokenRepo.logLoginEvent({
          userId: user.id,
          emailAttempt: email,
          success: false,
          failureReason: 'locked',
          ip,
          userAgent
        });
        const err = new Error('Account temporarily locked. Try again later.');
        err.status = 423;
        throw err;
      }

      if (user.status === 'suspended' || user.status === 'closed') {
        const err = new Error(GENERIC_AUTH_ERROR);
        err.status = 401;
        throw err;
      }

      const ok = await verifyPassword(user.passwordHash, password);
      if (!ok) {
        await userRepo.recordLoginFailure(user.id, MAX_ATTEMPTS, LOCK_MINUTES);
        await tokenRepo.logLoginEvent({
          userId: user.id,
          emailAttempt: email,
          success: false,
          failureReason: 'bad_password',
          ip,
          userAgent
        });
        const err = new Error(GENERIC_AUTH_ERROR);
        err.status = 401;
        throw err;
      }

      await userRepo.recordLoginSuccess(user.id);
      await tokenRepo.logLoginEvent({
        userId: user.id,
        emailAttempt: email,
        success: true,
        ip,
        userAgent
      });

      const roles = await userRepo.getRoleCodes(user.id);
      const needsMfa = user.mfaRequired && user.mfaEnrolledAt;

      return {
        user: {
          id: user.id,
          email: user.email,
          status: user.status,
          roles
        },
        needsMfa: Boolean(needsMfa),
        // Until MFA is enrolled, allow session but flag for enrolment in later UI
        mustEnrollMfa: user.mfaRequired && !user.mfaEnrolledAt
      };
    },

    async requestPasswordReset(email, ip) {
      const user = await userRepo.findByEmail(email);
      // Always return success message to avoid enumeration
      if (!user) {
        return { accepted: true };
      }
      const rawToken = randomToken(32);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
      await tokenRepo.createPasswordReset(user.id, rawToken, expiresAt, ip);
      logger.info({ userId: user.id }, 'Password reset token created');

      // Send reset link via Resend (best-effort; still return accepted)
      if (emailService?.sendPasswordReset) {
        try {
          const name =
            [user.firstName, user.lastName].filter(Boolean).join(' ') ||
            (user.email ? String(user.email).split('@')[0] : undefined);
          await emailService.sendPasswordReset({
            to: user.email,
            customerName: name,
            rawToken
          });
        } catch (err) {
          logger.error({ err, userId: user.id }, 'Password reset email failed');
        }
      }

      const payload = { accepted: true };
      if (process.env.AUTH_DEV_EXPOSE_RESET_TOKEN === 'true') {
        payload.devResetToken = rawToken;
      }
      return payload;
    },

    async resetPassword(token, newPassword) {
      const userId = await tokenRepo.consumePasswordReset(token);
      if (!userId) {
        const err = new Error('This reset link is invalid or has expired.');
        err.status = 400;
        throw err;
      }
      const passwordHash = await hashPassword(newPassword);
      await userRepo.updatePassword(userId, passwordHash);
      return { ok: true };
    }
  };
}

module.exports = { createAuthService };