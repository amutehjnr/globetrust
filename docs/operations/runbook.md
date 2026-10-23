# Operations runbook

## Health
- Liveness: `GET /health/live`
- Readiness: `GET /health/ready` (MySQL required; Redis checked if `REDIS_URL` set)

## Deploy checklist
1. Secrets loaded from secrets manager (not `.env` on disk in production)
2. `SESSION_COOKIE_SECURE=true`, HTTPS only, `TRUST_PROXY` correct
3. `REDIS_URL` required (disable `SESSION_ALLOW_MEMORY`)
4. `CORE_BANKING_MODE` only switched from `sandbox` after bank sign-off
5. `KYC_STORAGE=cloudinary` only with authenticated media + private retrieval path
6. Run migrations / schema under change control
7. Verify `/health/ready` returns 200

## Backups
- MySQL: automated daily snapshots + binlog/PITR per host policy
- Test restore quarterly to an isolated environment
- Redis sessions are ephemeral — loss forces re-login (acceptable)

## Incident response (high level)
1. Contain (revoke sessions, disable risky routes via config flag if available)
2. Preserve logs (Pino, audit_events, webhook_events)
3. Notify bank security / compliance contacts
4. Rotate secrets if exposure suspected
5. Post-incident review before re-enabling features

## Disaster recovery
- RTO/RPO targets must be set by the bank
- App tier is stateless aside from local `storage/kyc` — prefer object storage in production
- Failover: restore DB, point app at new endpoints, verify readiness, then traffic
