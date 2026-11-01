'use strict';

/**
 * Apply support chat attachment columns.
 *
 * PowerShell:
 *   node scripts/run-support-attachments-migration.js
 *
 * Uses the same env as the app:
 *   MYSQL_HOST, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD, MYSQL_PORT
 *   or DATABASE_URL
 */

require('dotenv').config();

const mysql = require('mysql2/promise');

function createPool() {
  if (process.env.DATABASE_URL) {
    return mysql.createPool({
      uri: process.env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 1
    });
  }

  const host = process.env.MYSQL_HOST || process.env.DB_HOST;
  const database = process.env.MYSQL_DATABASE || process.env.DB_NAME;
  const user = process.env.MYSQL_USER || process.env.DB_USER;
  const password = process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '';
  const port = Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306);

  if (!host || !database || !user) {
    throw new Error(
      'Missing DB config. Set MYSQL_HOST, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD (or DATABASE_URL) in .env'
    );
  }

  console.log(`Connecting to ${host}:${port} / ${database} as ${user}`);
  return mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 1,
    charset: 'utf8mb4',
    timezone: 'Z'
  });
}

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS c
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(rows[0].c) > 0;
}

async function main() {
  const pool = createPool();
  const conn = await pool.getConnection();

  try {
    console.log('Updating message_type enum…');
    await conn.query(
      `ALTER TABLE support_messages
       MODIFY COLUMN message_type ENUM('text','system','image','file') NOT NULL DEFAULT 'text'`
    );
    console.log('  message_type OK');

    if (!(await columnExists(conn, 'support_messages', 'attachment_url'))) {
      await conn.query(
        `ALTER TABLE support_messages
         ADD COLUMN attachment_url VARCHAR(500) NULL AFTER message_text`
      );
      console.log('  added attachment_url');
    } else {
      console.log('  attachment_url already exists — skip');
    }

    if (!(await columnExists(conn, 'support_messages', 'attachment_name'))) {
      await conn.query(
        `ALTER TABLE support_messages
         ADD COLUMN attachment_name VARCHAR(255) NULL AFTER attachment_url`
      );
      console.log('  added attachment_name');
    } else {
      console.log('  attachment_name already exists — skip');
    }

    if (!(await columnExists(conn, 'support_messages', 'attachment_mime'))) {
      await conn.query(
        `ALTER TABLE support_messages
         ADD COLUMN attachment_mime VARCHAR(120) NULL AFTER attachment_name`
      );
      console.log('  added attachment_mime');
    } else {
      console.log('  attachment_mime already exists — skip');
    }

    console.log('');
    console.log('Migration complete.');
  } catch (err) {
    console.error('Migration failed:', err.message || err);
    if (err.code === 'ER_BAD_DB_ERROR') {
      console.error('Hint: MYSQL_DATABASE does not exist or is wrong.');
    }
    if (err.code === 'ER_NO_SUCH_TABLE') {
      console.error('Hint: support_messages table missing — import schema.sql first.');
    }
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

main();