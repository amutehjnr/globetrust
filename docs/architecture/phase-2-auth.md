# Phase 2 — Authentication

## Implemented
- Argon2id password hashing
- Register / sign-in / sign-out
- Server-side sessions (`express-session`)
- Redis store when `REDIS_URL` is set; MemoryStore only if `SESSION_ALLOW_MEMORY=true`
- Session regenerate on login (fixation mitigation)
- CSRF double-submit token on state-changing routes
- Stricter rate limits: login, register, recovery
- Account lockout after repeated failures (DB fields)
- Password reset tokens (hashed at rest, single-use, 30-minute expiry)
- Login event logging
- RBAC helpers: `requireAuth`, `requireRole`
- Minimal authenticated shell at `/app`

## MFA status
- Schema: `mfa_totp_secrets`
- Login path recognizes enrolled MFA and would redirect to `/mfa/verify`
- TOTP enrolment UI and verification routes: **next increment**
- Production must block financial actions until MFA is enrolled when `mfa_required` is true

## Not production-complete
- Email delivery for verification / reset (needs approved provider)
- Secret encryption for TOTP at rest
- Global session revocation list beyond destroy-current
- Full admin RBAC screens
