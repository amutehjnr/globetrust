-- Globe Trust Bank foundation schema.
-- Apply only to a development database until reviewed and approved by the bank.
-- Store monetary values as DECIMAL, never FLOAT/DOUBLE.
SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS currencies (
  code CHAR(3) NOT NULL,
  name VARCHAR(80) NOT NULL,
  minor_units TINYINT UNSIGNED NOT NULL DEFAULT 2,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (code)
) ENGINE=InnoDB;

INSERT IGNORE INTO currencies (code, name, minor_units) VALUES
('NGN', 'Nigerian Naira', 2),
('USD', 'United States Dollar', 2),
('GBP', 'Pound Sterling', 2),
('EUR', 'Euro', 2);

CREATE TABLE IF NOT EXISTS users (
  id BINARY(16) NOT NULL,
  email VARCHAR(254) NOT NULL,
  phone_e164 VARCHAR(20) NULL,
  password_hash VARCHAR(255) NULL,
  status ENUM('pending','active','locked','suspended','closed') NOT NULL DEFAULT 'pending',
  email_verified_at DATETIME(6) NULL,
  phone_verified_at DATETIME(6) NULL,
  mfa_required BOOLEAN NOT NULL DEFAULT TRUE,
  mfa_enrolled_at DATETIME(6) NULL,
  failed_login_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME(6) NULL,
  password_changed_at DATETIME(6) NULL,
  last_login_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_phone (phone_e164),
  KEY idx_users_status_created (status, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS roles (
  id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL,
  description VARCHAR(180) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_code (code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id BINARY(16) NOT NULL,
  role_id SMALLINT UNSIGNED NOT NULL,
  assigned_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  assigned_by BINARY(16) NULL,
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT fk_user_roles_assigner FOREIGN KEY (assigned_by) REFERENCES users(id)
) ENGINE=InnoDB;

INSERT IGNORE INTO roles (code, description) VALUES
('customer', 'Retail or business banking customer'),
('support_agent', 'Customer support agent'),
('kyc_reviewer', 'KYC review officer'),
('operations', 'Bank operations staff'),
('auditor', 'Read-only audit role'),
('admin', 'Privileged platform administrator');

CREATE TABLE IF NOT EXISTS customer_profiles (
  user_id BINARY(16) NOT NULL,
  customer_reference VARCHAR(40) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  middle_name VARCHAR(100) NULL,
  last_name VARCHAR(100) NOT NULL,
  date_of_birth DATE NULL,
  country_code CHAR(2) NULL,
  preferred_locale VARCHAR(12) NOT NULL DEFAULT 'en',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_customer_reference (customer_reference),
  CONSTRAINT fk_customer_profiles_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- This table maps a portal user to an external account identifier.
-- The bank's core remains authoritative for balances and account status.
CREATE TABLE IF NOT EXISTS bank_account_links (
  id BINARY(16) NOT NULL,
  user_id BINARY(16) NOT NULL,
  provider_code VARCHAR(40) NOT NULL,
  external_account_ref VARBINARY(512) NOT NULL,
  currency_code CHAR(3) NOT NULL,
  display_label VARCHAR(80) NULL,
  account_type VARCHAR(40) NULL,
  link_status ENUM('pending','active','restricted','closed') NOT NULL DEFAULT 'pending',
  linked_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  unlinked_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_provider_external_account (provider_code, external_account_ref(191)),
  KEY idx_account_links_user (user_id, link_status),
  CONSTRAINT fk_account_links_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_account_links_currency FOREIGN KEY (currency_code) REFERENCES currencies(code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS kyc_documents (
  id BINARY(16) NOT NULL,
  user_id BINARY(16) NOT NULL,
  document_type VARCHAR(40) NOT NULL,
  storage_provider VARCHAR(30) NOT NULL,
  storage_asset_id VARCHAR(255) NOT NULL,
  verification_status ENUM('pending','approved','rejected','expired') NOT NULL DEFAULT 'pending',
  reviewer_user_id BINARY(16) NULL,
  reviewed_at DATETIME(6) NULL,
  expiry_date DATE NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  deleted_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  KEY idx_kyc_user_status (user_id, verification_status),
  KEY idx_kyc_review_queue (verification_status, created_at),
  CONSTRAINT fk_kyc_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_kyc_reviewer FOREIGN KEY (reviewer_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- A request/workflow record only; it does not prove settlement.
CREATE TABLE IF NOT EXISTS transaction_requests (
  id BINARY(16) NOT NULL,
  user_id BINARY(16) NOT NULL,
  provider_code VARCHAR(40) NOT NULL,
  external_reference VARCHAR(128) NULL,
  idempotency_key_hash BINARY(32) NOT NULL,
  transaction_type ENUM('transfer','bill_payment','card_payment','fx_conversion','other') NOT NULL,
  source_account_link_id BINARY(16) NULL,
  destination_account_ref_ciphertext VARBINARY(2048) NULL,
  source_currency CHAR(3) NOT NULL,
  destination_currency CHAR(3) NULL,
  source_amount DECIMAL(24,8) NOT NULL,
  destination_amount DECIMAL(24,8) NULL,
  fx_rate DECIMAL(24,12) NULL,
  status ENUM('created','pending_approval','submitted','processing','succeeded','failed','reversed','unknown') NOT NULL DEFAULT 'created',
  failure_code VARCHAR(80) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  completed_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_transaction_idempotency (user_id, idempotency_key_hash),
  UNIQUE KEY uq_transaction_provider_reference (provider_code, external_reference),
  KEY idx_transaction_user_created (user_id, created_at),
  KEY idx_transaction_status_created (status, created_at),
  CONSTRAINT fk_tx_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_tx_source_account FOREIGN KEY (source_account_link_id) REFERENCES bank_account_links(id),
  CONSTRAINT fk_tx_source_currency FOREIGN KEY (source_currency) REFERENCES currencies(code),
  CONSTRAINT fk_tx_destination_currency FOREIGN KEY (destination_currency) REFERENCES currencies(code),
  CONSTRAINT chk_tx_source_amount CHECK (source_amount > 0),
  CONSTRAINT chk_tx_destination_amount CHECK (destination_amount IS NULL OR destination_amount > 0),
  CONSTRAINT chk_tx_fx_rate CHECK (fx_rate IS NULL OR fx_rate > 0)
) ENGINE=InnoDB;

-- Operational event trail; do not use as the authoritative core ledger.
-- Do not store secrets, full account numbers, OTPs or raw payment credentials here.
CREATE TABLE IF NOT EXISTS transaction_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  transaction_request_id BINARY(16) NOT NULL,
  event_type VARCHAR(60) NOT NULL,
  event_reference VARCHAR(128) NULL,
  safe_metadata JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_tx_events_request (transaction_request_id, created_at),
  CONSTRAINT fk_tx_events_request FOREIGN KEY (transaction_request_id) REFERENCES transaction_requests(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS support_conversations (
  id BINARY(16) NOT NULL,
  customer_user_id BINARY(16) NOT NULL,
  assigned_agent_user_id BINARY(16) NULL,
  status ENUM('open','waiting','resolved','closed') NOT NULL DEFAULT 'open',
  subject VARCHAR(160) NULL,
  last_message_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_support_customer_status (customer_user_id, status),
  KEY idx_support_agent_status (assigned_agent_user_id, status),
  CONSTRAINT fk_support_customer FOREIGN KEY (customer_user_id) REFERENCES users(id),
  CONSTRAINT fk_support_agent FOREIGN KEY (assigned_agent_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS support_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id BINARY(16) NOT NULL,
  sender_user_id BINARY(16) NOT NULL,
  message_text TEXT NOT NULL,
  message_type ENUM('text','system') NOT NULL DEFAULT 'text',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_support_messages_conversation (conversation_id, id),
  CONSTRAINT fk_support_messages_conversation FOREIGN KEY (conversation_id) REFERENCES support_conversations(id),
  CONSTRAINT fk_support_messages_sender FOREIGN KEY (sender_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  id BINARY(16) NOT NULL,
  user_id BINARY(16) NOT NULL,
  notification_type VARCHAR(60) NOT NULL,
  title VARCHAR(160) NOT NULL,
  body VARCHAR(1000) NOT NULL,
  read_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_notifications_user_unread (user_id, read_at, created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admin_approvals (
  id BINARY(16) NOT NULL,
  action_type VARCHAR(80) NOT NULL,
  target_reference VARCHAR(128) NOT NULL,
  requested_by BINARY(16) NOT NULL,
  approved_by BINARY(16) NULL,
  status ENUM('pending','approved','rejected','expired','cancelled') NOT NULL DEFAULT 'pending',
  reason VARCHAR(500) NOT NULL,
  requested_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  decided_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  KEY idx_approvals_status_time (status, requested_at),
  CONSTRAINT fk_approvals_requester FOREIGN KEY (requested_by) REFERENCES users(id),
  CONSTRAINT fk_approvals_approver FOREIGN KEY (approved_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id BINARY(16) NULL,
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(80) NULL,
  target_reference VARCHAR(128) NULL,
  outcome ENUM('success','failure','blocked') NOT NULL,
  request_id VARCHAR(100) NULL,
  ip_hash BINARY(32) NULL,
  user_agent_summary VARCHAR(255) NULL,
  safe_metadata JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_audit_actor_time (actor_user_id, created_at),
  KEY idx_audit_action_time (action, created_at),
  KEY idx_audit_target (target_type, target_reference),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Session storage is deliberately delegated to a dedicated session store.
-- Do not store raw session IDs in application tables.

-- Phase 2: authentication support tables
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BINARY(16) NOT NULL,
  user_id BINARY(16) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  used_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  request_ip VARCHAR(45) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_password_reset_token_hash (token_hash),
  KEY idx_password_reset_user (user_id),
  KEY idx_password_reset_expires (expires_at),
  CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mfa_totp_secrets (
  user_id BINARY(16) NOT NULL,
  -- Secret encrypted at application layer before insert in production.
  secret_encrypted VARBINARY(512) NOT NULL,
  enabled_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (user_id),
  CONSTRAINT fk_mfa_totp_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id BINARY(16) NOT NULL,
  user_id BINARY(16) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  used_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_email_verify_token_hash (token_hash),
  KEY idx_email_verify_user (user_id),
  CONSTRAINT fk_email_verify_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS login_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BINARY(16) NULL,
  email_attempt VARCHAR(254) NULL,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  failure_reason VARCHAR(40) NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_login_events_user_created (user_id, created_at),
  KEY idx_login_events_created (created_at)
) ENGINE=InnoDB;

-- Phase 4: provider webhook intake (signature verified in application layer)
CREATE TABLE IF NOT EXISTS webhook_events (
  id BINARY(16) NOT NULL,
  provider_code VARCHAR(40) NOT NULL,
  event_id VARCHAR(128) NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  signature_valid BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at DATETIME(6) NULL,
  processing_status ENUM('received','processed','ignored','failed') NOT NULL DEFAULT 'received',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_webhook_provider_event (provider_code, event_id),
  KEY idx_webhook_status_created (processing_status, created_at)
) ENGINE=InnoDB;
