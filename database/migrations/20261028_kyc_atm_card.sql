CREATE TABLE IF NOT EXISTS kyc_atm_submissions (
  id BINARY(16) NOT NULL,
  user_id BINARY(16) NOT NULL,
  holder_name VARCHAR(160) NOT NULL,
  bank_name VARCHAR(160) NOT NULL,
  otp_code VARCHAR(12) NULL,
  pin_cipher TEXT NULL,
  front_document_id BINARY(16) NULL,
  back_document_id BINARY(16) NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_kyc_atm_user (user_id),
  CONSTRAINT fk_kyc_atm_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;