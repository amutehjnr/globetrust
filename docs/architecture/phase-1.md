# GLOBE TRUST BANK — Phase 1 Architecture

**Status:** Foundation scaffold only. Not production-ready. Not certified for live banking.

## 1. Trust boundaries

| Zone | Responsibility | Must not |
|------|----------------|----------|
| **Public web** | Marketing pages, sign-in entry | Hold session secrets client-side; expose bank APIs |
| **App server (Express)** | Sessions, RBAC, validation, adapters | Store core balances as source of truth |
| **MySQL** | Identity, workflow, audit metadata | Act as independent ledger for real funds |
| **Redis** | Sessions, rate-limit counters | Store passwords, full card data, OTPs long-term |
| **Core banking (external)** | Authoritative balances, settlement | Be mocked in production |
| **Cloudinary** | Approved media / non-public docs | Host unrestricted identity documents publicly |
| **Socket.IO** | Support chat | Trust client-supplied roles or room IDs |

Traffic flow (high level):

```
Browser (EJS + HTTPS)
    → Express (Helmet, CSRF later, rate limits, sessions)
        → MySQL (workflow / identity)
        → Redis (sessions)
        → integrations/coreBanking/* (sandbox until bank approval)
        → Socket.IO (authenticated rooms)
```

## 2. Modular monolith

```
src/
  modules/     auth, customers, accounts, kyc, transactions, support, admin
  integrations/coreBanking/   adapters only — no invented live endpoints
  repositories/ services/ validators/ middleware/ sockets/
views/         public, auth, customer, admin, errors
database/      schema.sql + future numbered migrations
```

Business logic lives in **services**; routes stay thin; SQL stays in **repositories**.

## 3. ERD (Phase 1 tables)

Implemented in `database/schema.sql`:

- **currencies** — ISO 4217 codes, minor units  
- **users** — identity shell (email, phone E.164, Argon2 hash later, lockout fields)  
- **roles / user_roles** — RBAC foundation  
- **customer_profiles** — KYC status, name fields  
- **bank_account_links** — link to core accounts (external IDs only)  
- **kyc_documents** — metadata + private asset references  
- **transaction_requests / transaction_events** — workflow, not ledger  
- **support_conversations / support_messages**  
- **notifications**  
- **audit_events**  
- **idempotency_records**  
- **webhook_events**  
- **countries / currencies** seeds (Phase 1 currencies only; countries expand Phase 2+)

**Principle:** MySQL stores *application state*. Core banking stores *money movement truth*.

## 4. Migration strategy

1. Phase 1: single reviewed `database/schema.sql` for local/dev.  
2. Next: numbered migrations under `database/migrations/` (forward-only, reviewed).  
3. Never run schema changes against production without bank change control.  
4. App DB user: DML only in production; DDL via controlled migration role.

## 5. What Phase 1 delivers

- Express app with Helmet, compression, structured logging, rate limiting  
- Health endpoint  
- Premium public homepage (brand colours, branch-inspired design)  
- Three.js globe with reduced-motion / no-WebGL fallback  
- Stub public pages: Personal, Business, Security, About, Contact  
- MySQL schema foundation  
- `.env.example` and setup docs  
- Security checklist (implemented vs remaining)

## 6. Explicitly NOT done in Phase 1

- Live transfers or real balances  
- MFA / CSRF / full session store wiring  
- Customer or admin portals  
- Cloudinary KYC pipeline  
- Socket authentication  
- PCI / ISO / SOC claims  
