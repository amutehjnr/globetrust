'use strict';

const mysql = require('mysql2/promise');

function createDatabasePool() {
  const required = ['MYSQL_HOST', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD'];
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
  }

  return mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    database: process.env.MYSQL_DATABASE,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
    queueLimit: 0,
    charset: 'utf8mb4',
    timezone: 'Z',
    supportBigNumbers: true,
    decimalNumbers: false,
    multipleStatements: false,
    enableKeepAlive: true
  });
}

module.exports = { createDatabasePool };
