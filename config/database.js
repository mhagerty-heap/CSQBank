require('dotenv').config();
const { Pool } = require('pg');

// Postgres (Neon) holds loan state and nothing else — identity lives in the
// session cookie and the banking baseline is bundled in code (lib/baseline.js).
// Only the /loans routes (and the loan Selenium script) ever touch it, so
// Neon's scale-to-zero compute stays asleep for everything else.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const SCHEMA_SQL = `
  -- Keyed by email rather than a users table: login is intentionally
  -- frictionless (see routes/auth.js), so there is no account row to point at.
  CREATE TABLE IF NOT EXISTS loans (
    id SERIAL PRIMARY KEY,
    user_email TEXT NOT NULL,
    applicant_name TEXT,
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

  CREATE TABLE IF NOT EXISTS loan_events (
    id SERIAL PRIMARY KEY,
    loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT 'system',
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_loans_email ON loans(user_email);
  CREATE INDEX IF NOT EXISTS idx_loan_events_loan ON loan_events(loan_id);
`;

// Cached so the CREATE TABLE statements only actually run once per warm
// process, but every cold start still guarantees the schema exists before
// any query runs.
let schemaReady = null;
function ensureSchema() {
  if (!schemaReady) {
    // Don't cache a failure (e.g. a Neon cold-start timeout) — retry next call.
    schemaReady = pool.query(SCHEMA_SQL).catch(err => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

module.exports = { pool, ensureSchema };
