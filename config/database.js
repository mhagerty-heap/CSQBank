require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const SCHEMA_SQL = `
  -- Identity. No password column: login is intentionally frictionless (see routes/auth.js).
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Shared/global demo accounts. Not owned by a user_id on purpose: every
  -- persona sees the same checking/savings accounts and activity, mirroring
  -- the old app's per-browser sessionStorage behavior rather than real
  -- per-customer data. Only loan_applications below is genuinely per-identity.
  CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    account_type TEXT NOT NULL,
    display_label TEXT NOT NULL,
    account_number TEXT NOT NULL,
    routing_number TEXT NOT NULL,
    balance REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active'
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS bill_pay_payees (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS friend_pay_contacts (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS credit_card_applications (
    id SERIAL PRIMARY KEY,
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
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- The one genuinely per-identity, persisted-over-time entity.
  CREATE TABLE IF NOT EXISTS loan_applications (
    id SERIAL PRIMARY KEY,
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
    submitted_at TIMESTAMPTZ,
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS loan_application_events (
    id SERIAL PRIMARY KEY,
    loan_application_id INTEGER NOT NULL REFERENCES loan_applications(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT 'system',
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
  CREATE INDEX IF NOT EXISTS idx_loans_user ON loan_applications(user_id);
  CREATE INDEX IF NOT EXISTS idx_loan_events_loan ON loan_application_events(loan_application_id);
`;

// Cached so the CREATE TABLE statements only actually run once per warm
// process, but every cold start still guarantees the schema exists before
// any query runs.
let schemaReady = null;
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = pool.query(SCHEMA_SQL);
  }
  return schemaReady;
}

module.exports = { pool, ensureSchema };
