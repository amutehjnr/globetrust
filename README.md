# GLOBE TRUST BANK — Digital banking platform (foundation)

Modular **Node.js / Express / EJS / MySQL** foundation for a licensed bank’s customer experience.

## Important scope and safety

This is a **starter scaffold**, not a certified banking system. Do **not** connect it to live customer accounts or move real money until the bank’s security, architecture, legal, compliance, and operational teams have reviewed and approved it.

Actual balances, account status, settlement, and transfer authorisation must come from the bank’s **authoritative core banking / payment systems**.

## Phase 1 complete (this tree)

- Express app: Helmet, compression, rate limiting, structured logging (Pino)
- MySQL foundation schema (`database/schema.sql`)
- Premium public homepage (navy / ivory / champagne brand)
- Canvas globe with reduced-motion support and CSS fallback
- Public pages: Personal, Business, Security, About, Contact, Sign-in stub
- Architecture note: `docs/architecture/phase-1.md`
- Security checklist: `docs/security/phase-1-checklist.md`

## Requirements

- Node.js **LTS** (≥ 22 recommended)
- MySQL **8.4** LTS (InnoDB)
- Redis (required in later phases for sessions; optional for Phase 1 static browse if you relax DB boot check)

## Setup (Windows PowerShell)

```powershell
cd globe-trust-bank
Copy-Item .env.example .env
# Edit .env — set MYSQL_* and SESSION secrets

# Create database + user in MySQL, then:
Get-Content database\schema.sql | mysql -u gtb_app -p globe_trust_bank

npm install
npm run dev
```

Open `http://localhost:3000`.

### Verify

- `GET /health/live` → `{ "status": "ok" }`
- Home page loads with globe animation (or static orb if motion reduced)
- `/personal`, `/business`, `/security`, `/about`, `/contact` return 200
- `/does-not-exist` → 404 page

## Brand colours

| Token | Hex |
|-------|-----|
| Trust navy | `#172440` |
| Deep navy | `#263653` |
| Ivory marble | `#F4F0E8` |
| Soft stone | `#E4E0D8` |
| Champagne | `#C3B49C` |

Reference photograph: `public/images/branch-reference.jpg`

## Environment

See `.env.example`. Never commit `.env`, bank credentials, or customer data.

## Phases implemented in this tree
1. Foundation, schema, public site
2. Auth, sessions, CSRF, recovery
2b. TOTP MFA
3. Customer/admin portals, KYC upload
4. Sandbox core banking, transfers, webhooks
5. Support chat (Socket.IO), Cloudinary option
6. Health readiness, audit UI, ops/security docs

## Next phases (bank-led)


2. Auth, sessions (Redis), MFA, CSRF  
3. Customer + admin dashboards, KYC  
4. Core banking adapters (sandbox → approved live)  
5. Cloudinary, Socket.IO support  
6. Hardening, DR, formal go-live approval  

## License / ownership

Proprietary — for use under agreement with the licensed institution.
