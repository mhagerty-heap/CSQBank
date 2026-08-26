const db = require('../config/database');

const CREDIT_STATUSES = new Set(['received', 'transferred_in', 'friend_pay_in']);

function getAccountByType(type) {
  return db.prepare('SELECT * FROM accounts WHERE account_type = ?').get(type);
}

function listAccounts() {
  return db.prepare('SELECT * FROM accounts ORDER BY account_type').all();
}

function listTransactions(accountId, limit) {
  const sql = `SELECT * FROM transactions WHERE account_id = ? ORDER BY transaction_date DESC, id DESC${limit ? ' LIMIT ?' : ''}`;
  return limit ? db.prepare(sql).all(accountId, limit) : db.prepare(sql).all(accountId);
}

function nextTransactionNumber() {
  const row = db.prepare('SELECT COALESCE(MAX(transaction_number), 100000) AS maxNum FROM transactions').get();
  return row.maxNum + 1;
}

// Posts a transaction against an account and keeps its balance in sync.
// `amount` is always a positive magnitude; the sign of the balance
// adjustment is derived from `status` (see CREDIT_STATUSES above).
function postTransaction(accountId, { counterpartyName, amount, status, notes, counterpartyAccountNumber, counterpartyRoutingNumber, relatedTransactionId, transactionDate }) {
  const transactionNumber = nextTransactionNumber();
  const date = transactionDate || new Date().toISOString().slice(0, 10);

  const result = db.prepare(`
    INSERT INTO transactions (
      transaction_number, account_id, counterparty_name, transaction_date, amount, status,
      notes, counterparty_account_number, counterparty_routing_number, related_transaction_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    transactionNumber, accountId, counterpartyName, date, amount, status,
    notes || null, counterpartyAccountNumber || null, counterpartyRoutingNumber || null, relatedTransactionId || null
  );

  const delta = CREDIT_STATUSES.has(status) ? amount : -amount;
  db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(delta, accountId);

  return result.lastInsertRowid;
}

function listBillPayPayees() {
  return db.prepare('SELECT * FROM bill_pay_payees ORDER BY name').all();
}

function addBillPayPayee(name, code) {
  db.prepare('INSERT INTO bill_pay_payees (name, code) VALUES (?, ?)').run(name, code);
}

function listFriendPayContacts() {
  return db.prepare('SELECT * FROM friend_pay_contacts ORDER BY name').all();
}

function addFriendPayContact(name, code) {
  db.prepare('INSERT INTO friend_pay_contacts (name, code) VALUES (?, ?)').run(name, code);
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
