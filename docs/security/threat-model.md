# Threat model (summary) — Globe Trust Bank portal

**Scope:** Customer/admin web portal, session auth, KYC metadata, sandbox transfers, support chat.

## Assets
- Customer credentials and session cookies
- KYC document blobs / Cloudinary asset IDs
- Transfer workflow records and idempotency keys
- Admin privileges (KYC approve, audit, support)

## Trust boundaries
Browser → HTTPS → Express → MySQL / Redis / Core-banking adapter / Cloudinary / Socket.IO

## Top threats & mitigations in this scaffold
| Threat | Mitigation status |
|--------|-------------------|
| Credential stuffing | Rate limits, lockout fields, generic errors — **partial** |
| Session theft | HttpOnly cookies, regenerate on login — **partial** (need Secure+HTTPS prod) |
| CSRF | Double-submit token — **implemented** for form POSTs |
| IDOR on conversations/transfers | Server-side ownership checks — **implemented** |
| SQL injection | mysql2 parameterized queries — **pattern established** |
| XSS | EJS escaped output by default — **review each raw include** |
| Webhook spoofing | HMAC verify + event dedupe — **sandbox pattern** |
| Privilege escalation | requireRole middleware — **implemented**, needs continuous review |
| Fake settlement claims | Explicit sandbox labels; core bank is source of truth — **documented** |

## Out of scope until bank approval
- Live money movement
- Guarantees of PCI DSS / ISO 27001 / SOC 2
- Public KYC document URLs
