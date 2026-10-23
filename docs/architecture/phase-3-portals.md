# Phase 3 — Customer & admin portals

## Customer (`/app/*`)
- Overview, accounts links, profile, KYC upload
- No fabricated live balances

## Admin (`/admin/*`)
- Overview counts, customer search, KYC approve/reject + audit

## Promote staff (dev)
```sql
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE u.email = 'staff@example.com' AND r.code IN ('admin','kyc_reviewer');
```
