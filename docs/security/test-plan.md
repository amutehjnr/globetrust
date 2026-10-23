# Security test plan

## Automated (scaffold)
```bash
node tests/security/authz.smoke.js
node --check src/app.js
```

## Manual / integration (required before go-live)
1. Unauthenticated access to `/app`, `/admin`, `/admin/audit` → redirect or 401/403
2. Customer A cannot open customer B support conversation or transfer by ID
3. CSRF token missing on POST → 403
4. Login rate limit triggers after repeated failures
5. Account lockout after failed passwords
6. MFA enrolled user cannot skip `/mfa/verify`
7. Webhook with bad signature → 401; replay same eventId → duplicate accepted without reprocessing side effects
8. KYC upload rejects `.exe` and oversized files
9. Socket connection without session cookie fails
10. Agent role cannot call dual-control actions reserved for admin (when those exist)

## Independent testing
Commission external penetration test and remediate before enabling live core banking.
