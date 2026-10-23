# Production readiness checklist

This application is **not** production-certified by virtue of code completeness.

## Must be true before live customer money
- [ ] Legal / compliance approval for the digital channel
- [ ] Core banking adapter built from **official** bank API docs
- [ ] Independent security assessment completed and findings closed
- [ ] MFA enforced before transfers and sensitive changes
- [ ] Dual control for high-risk admin actions per bank policy
- [ ] Private KYC storage with authorized reviewer retrieval only
- [ ] Monitoring, alerting, and on-call rota
- [ ] Backup restore drill evidence
- [ ] Data retention and deletion procedures documented
- [ ] WAF / rate limits / geo policy as required by the bank
- [ ] Secrets exclusively in a managed secrets system
- [ ] Formal go-live sign-off recorded

## Explicit non-claims
Do not market this portal as PCI DSS, ISO 27001, or SOC 2 compliant without current attestations.

## Implemented engineering follow-ups
- [x] MFA required before transfer pages/actions (`requireMfaEnrolled`)
- [x] Secure KYC viewer for admin/kyc_reviewer (`/admin/kyc/documents/:id`)
- [x] CI workflow (syntax, smoke tests, audit, Docker build)
- [x] Hardened Dockerfile + HEALTHCHECK on `/health/ready`
- [x] `/metrics` endpoint + optional heartbeat logs
