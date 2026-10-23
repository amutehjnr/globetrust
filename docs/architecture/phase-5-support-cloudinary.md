# Phase 5 — Support chat & document storage

## Socket.IO
- Shares Express session middleware (`getSessionMiddleware`)
- Rejects connections without `session.user`
- `support:join` / `support:message` authorized via `supportService.assertCanAccess`
- Room name derived server-side: `support:{conversationId}`

## HTTP support
- Customer: `/app/support` (+ POST fallback)
- Agent: `/admin/support`, `/admin/support/:id`

## KYC storage
- Default: `storage/kyc` local private files
- Optional: `KYC_STORAGE=cloudinary` with **authenticated** Cloudinary upload
- No public URL delivery of identity documents

## Ops
Promote support agent:
```sql
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE u.email = 'agent@example.com' AND r.code = 'support_agent';
```
