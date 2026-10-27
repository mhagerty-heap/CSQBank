const baseline = require('./baseline');

const CREDIT_STATUSES = new Set(['received', 'transferred_in', 'friend_pay_in']);
const MAX_EXTRA_TRANSACTIONS_PER_ACCOUNT = 15;
const MAX_EXTRA_PAYEES = 15;
const MAX_EXTRA_CONTACTS = 15;

// Everyday banking activity (checking/savings, bill pay, friend pay) lives
// as a per-session overlay on top of a shared, read-only baseline (see
// lib/baseline.js, bundled in code) rather than as shared mutable rows. Every
// session — a live demo or an automated script — starts from the identical
// baseline; anything a session adds is only visible in that session's own
// cookie, never to any other session. Only loans remain persisted in
// Postgres, and nothing in this file touches the database.
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
  const base = baseline.accounts.find(a => a.account_type === type);
  if (!base) return null;
  const overlay = getOverlay(req);
  return { ...base, balance: base.balance + (overlay.deltas[type] || 0) };
}

async function listAccounts(req) {
  const rows = [...baseline.accounts].sort((a, b) => a.account_type.localeCompare(b.account_type));
  const overlay = getOverlay(req);
  return rows.map(a => ({ ...a, balance: a.balance + (overlay.deltas[a.account_type] || 0) }));
}

async function listTransactions(req, account, limit) {
  if (!account) return [];
  const base = baseline.transactionsByAccountId[account.id] || [];
  const overlay = getOverlay(req);
  const extra = overlay.extraTransactions[account.account_type] || [];
  const merged = [...extra, ...base];
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
  const base = [...baseline.BILL_PAY_PAYEES].sort((a, b) => a.name.localeCompare(b.name));
  return [...base, ...getOverlay(req).extraPayees];
}

function addBillPayPayee(req, name, code) {
  const overlay = getOverlay(req);
  overlay.extraPayees.push({ name, code });
  if (overlay.extraPayees.length > MAX_EXTRA_PAYEES) overlay.extraPayees.shift();
}

async function listFriendPayContacts(req) {
  const base = [...baseline.FRIEND_PAY_CONTACTS].sort((a, b) => a.name.localeCompare(b.name));
  return [...base, ...getOverlay(req).extraContacts];
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
