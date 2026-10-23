# Security checklist — Phase 1

Legend: **Done** | **Partial** | **Not started** | **Requires bank approval**

## Implemented in this scaffold
| Control | Status |
|---------|--------|
| Helmet baseline | Done |
| CSP directives (tight; expand for Three.js/CDNs carefully) | Partial |
| Request body size limits | Done |
| Structured logging with redaction paths | Done |
| General rate limiting | Done |
| Static file `dotfiles: deny` | Done |
| No credentials in repo (`.env.example` only) | Done |
| DECIMAL guidance for money in schema | Done |
| Parameterized queries via mysql2 | Done (when used) |
| Fail-fast DB connectivity on boot | Done |
| Generic 404/500 pages (no stack traces) | Done |

## Not started (later phases)
| Control | Status |
|---------|--------|
| Argon2id password hashing | Not started |
| Server-side sessions + Redis store | Not started |
| CSRF tokens for state-changing forms | Not started |
| MFA (TOTP/passkeys) | Not started |
| Account lockout enforcement on login | Not started |
| Socket.IO auth from server session | Not started |
| RBAC middleware on every protected route | Not started |
| Idempotency + webhook signature verify | Not started |
| Dual-control admin approvals | Not started |
| Dependency scanning in CI | Not started |
| Penetration test / independent review | Requires bank approval |

## Bank-specific approvals required before live finance
- Core banking API contract and credentials in secrets manager  
- Compliance review of data retention and KYC storage  
- Production CSP, CORS, and WAF policy  
- Incident response and backup restore drill  
- Legal review of public website claims  

**Do not present this application as production banking software until those items are complete and approved.**
