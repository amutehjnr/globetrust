# Phase 4 — Core banking integration (sandbox)

## Adapter
- `src/integrations/coreBanking/SandboxCoreAdapter.js`
- `CORE_BANKING_MODE=sandbox` only in this scaffold
- Methods: `getBalance`, `validateBeneficiary`, `initiateTransfer`, `getTransferStatus`, `verifyWebhookSignature`

## Application workflow
1. Ensure sandbox `bank_account_links` for NGN/USD
2. Present multi-currency balances (labelled demo)
3. Transfer request with **idempotency key** (unique per user)
4. Persist `transaction_requests` + `transaction_events`
5. Call adapter; store provider reference; never treat UI success as live settlement
6. Webhook `POST /webhooks/core-banking` with HMAC signature + duplicate event protection

## Production requirements (not implemented here)
- Bank-approved adapter using official API documentation
- Credentials in secrets manager
- Dual control / limits per bank policy
- Reconciliation jobs against authoritative ledger
- MFA step-up before transfer submit
