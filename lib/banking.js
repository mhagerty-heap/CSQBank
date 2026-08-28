const { pool } = require('../config/database');

const CREDIT_STATUSES = new Set(['received', 'transferred_in', 'friend_pay_in']);
const MAX_EXTRA_TRANSACTIONS_PER_ACCOUNT = 15;
const MAX_EXTRA_PAYEES = 15;
const MAX_EXTRA_CONTACTS = 15;

// Everyday banking activity (checking/savings, bill pay, friend pay) lives
// as a per-session overlay on top of a shared, read-only Postgres baseline
// (what `npm run seed` populates) rather than as shared mutable rows. Every
// session — a live demo or an automated script — starts from the identical
// seeded baseline; anything a session adds is only visible in that
// session's own cookie, never to any other session. Only loan_applications
// remain genuinely persisted per-identity in Postgres.
function getOverlay(req) {
  if (!req.session.bankingOverlay) {
    req.session.bankingOverlay = {
      deltas: {},
      extraTransactions: {},
      extraPayees: [],
      extraContacts: [],
    };
  }
  return req.session.bankingOverlay;
}

async function getAccountByType(req, type) {
  const base = (await pool.query('SELECT * FROM accounts WHERE account_type = $1', [type])).rows[0];
  if (!base) return null;
  const overlay = getOverlay(req);
  return { ...base, balance: base.balance + (overlay.deltas[type] || 0) };
}

async function listAccounts(req) {
  const rows = (await pool.query('SELECT * FROM accounts ORDER BY account_type')).rows;
  const overlay = getOverlay(req);
  return rows.map(a => ({ ...a, balance: a.balance + (overlay.deltas[a.account_type] || 0) }));
}

async function listTransactions(req, account, limit) {
  if (!account) return [];
  const baseline = (await pool.query(
    'SELECT * FROM transactions WHERE account_id = $1 ORDER BY transaction_date DESC, id DESC',
    [account.id]
  )).rows;
  const overlay = getOverlay(req);
  const extra = overlay.extraTransactions[account.account_type] || [];
  const merged = [...extra, ...baseline];
  return limit ? merged.slice(0, limit) : merged;
}

// Adds a session-local transaction and adjusts that account's session
// balance delta. Never writes to Postgres — see module comment above.
function postTransaction(req, accountType, { counterpartyName, amount, status, notes, transactionDate }) {
  const overlay = getOverlay(req);
  const delta = CREDIT_STATUSES.has(status) ? amount : -amount;
  overlay.deltas[accountType] = (overlay.deltas[accountType] || 0) + delta;

  const list = overlay.extraTransactions[accountType] || (overlay.extraTransactions[accountType] = []);
  list.unshift({
    counterparty_name: counterpartyName,
    transaction_date: transactionDate || new Date().toISOString().slice(0, 10),
    amount,
    status,
    notes: notes || null,
  });
  list.length = Math.min(list.length, MAX_EXTRA_TRANSACTIONS_PER_ACCOUNT);
}

async function listBillPayPayees(req) {
  const baseline = (await pool.query('SELECT * FROM bill_pay_payees ORDER BY name')).rows;
  return [...baseline, ...getOverlay(req).extraPayees];
}

function addBillPayPayee(req, name, code) {
  const overlay = getOverlay(req);
  overlay.extraPayees.push({ name, code });
  if (overlay.extraPayees.length > MAX_EXTRA_PAYEES) overlay.extraPayees.shift();
}

async function listFriendPayContacts(req) {
  const baseline = (await pool.query('SELECT * FROM friend_pay_contacts ORDER BY name')).rows;
  return [...baseline, ...getOverlay(req).extraContacts];
}

function addFriendPayContact(req, name, code) {
  const overlay = getOverlay(req);
  overlay.extraContacts.push({ name, code });
  if (overlay.extraContacts.length > MAX_EXTRA_CONTACTS) overlay.extraContacts.shift();
}

module.exports = {
  getAccountByType,
  listAccounts,
  listTransactions,
  postTransaction,
  listBillPayPayees,
  addBillPayPayee,
  listFriendPayContacts,
  addFriendPayContact,
};
