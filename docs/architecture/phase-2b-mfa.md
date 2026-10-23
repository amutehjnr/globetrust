# Phase 2b — TOTP MFA

## Flow
1. User signs in with password.
2. If `mfa_enrolled_at` is set → session holds `pendingMfaUser` → `/mfa/verify`.
3. If MFA required but not enrolled → full session with `mustEnrollMfa` → prompt to `/mfa/enrol`.
4. Enrolment: generate secret → AES-GCM at rest → QR + manual key → confirm with live TOTP code → set `enabled_at` + `mfa_enrolled_at`.

## Security notes
- Secrets encrypted with `MFA_ENCRYPTION_KEY` (or derived dev key from `SESSION_SECRET`).
- TOTP window ±1 step (`otplib`).
- Rate-limited verify/enrol POSTs.
- CSRF on POST.
- Session regenerate after successful MFA login.
- QR is a data URL rendered only to the authenticated enrol page.

## Not included yet
- Backup / recovery codes
- WebAuthn / passkeys
- Forced MFA before any future transfer route (should be enforced when Phase 4 lands)
