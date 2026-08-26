const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Vercel's filesystem is read-only except /tmp.
// Copy the bundled bank.db there on cold start so writes work.
let dbPath;
if (process.env.VERCEL) {
  const tmpPath = '/tmp/bank.db';
  if (!fs.existsSync(tmpPath)) {
    fs.copyFileSync(path.join(__dirname, '..', 'bank.db'), tmpPath);
  }
  dbPath = tmpPath;
} else {
  dbPath = path.join(__dirname, '..', 'bank.db');
}

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  -- Identity. No password column: login is intentionally frictionless (see routes/auth.js).
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Shared/global demo accounts. Not owned by a user_id on purpose: every
  -- persona sees the same checking/savings accounts and activity, mirroring
  -- the old app's per-browser sessionStorage behavior rather than real
  -- per-customer data. Only loan_applications below is genuinely per-identity.
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_type TEXT NOT NULL,
    display_label TEXT NOT NULL,
    account_number TEXT NOT NULL,
    routing_number TEXT NOT NULL,
    balance REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active'
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_number INTEGER UNIQUE NOT NULL,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    counterparty_name TEXT NOT NULL,
    transaction_date TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL,
    notes TEXT,
    counterparty_account_number TEXT,
    counterparty_routing_number TEXT,
    related_transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bill_pay_payees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS friend_pay_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS credit_card_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    middle_name TEXT,
    last_name TEXT NOT NULL,
    date_of_birth TEXT,
    phone TEXT,
    email TEXT,
    street TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    country TEXT DEFAULT 'US',
    residence_status TEXT,
    gross_monthly_income REAL,
    monthly_housing_payment REAL,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- The one genuinely per-identity, persisted-over-time entity.
  CREATE TABLE IF NOT EXISTS loan_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    loan_type TEXT NOT NULL DEFAULT 'personal',
    requested_amount REAL,
    term_months INTEGER,
    purpose TEXT,
    occupation TEXT,
    annual_income_bracket TEXT,
    net_worth_bracket TEXT,
    current_step INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'draft',
    decision_note TEXT,
    apr REAL,
    submitted_at DATETIME,
    decided_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS loan_application_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loan_application_id INTEGER NOT NULL REFERENCES loan_applications(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT 'system',
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

module.exports = db;
