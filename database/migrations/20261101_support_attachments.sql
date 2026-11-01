-- Support chat file attachments (run once on production DB)
-- Safe to re-run checks manually if columns already exist.

ALTER TABLE support_messages
  MODIFY COLUMN message_type ENUM('text','system','image','file') NOT NULL DEFAULT 'text';

-- Run each ADD only if the column is missing:
-- SHOW COLUMNS FROM support_messages LIKE 'attachment_%';

ALTER TABLE support_messages
  ADD COLUMN attachment_url VARCHAR(500) NULL AFTER message_text;

ALTER TABLE support_messages
  ADD COLUMN attachment_name VARCHAR(255) NULL AFTER attachment_url;

ALTER TABLE support_messages
  ADD COLUMN attachment_mime VARCHAR(120) NULL AFTER attachment_name;