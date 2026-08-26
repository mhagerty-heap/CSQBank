const { pool } = require('../config/database');

const CREDIT_STATUSES = new Set(['received', 'transferred_in', 'friend_pay_in']);

async function getAccountByType(type) {
  return (await pool.query('SELECT * FROM accounts WHERE account_type = $1', [type])).rows[0];
}

async function listAccounts() {
  return (await pool.query('SELECT * FROM accounts ORDER BY account_type')).rows;
}

async function listTransactions(accountId, limit) {
  const sql = `SELECT * FROM transactions WHERE account_id = $1 ORDER BY transaction_date DESC, id DESC${limit ? ' LIMIT $2' : ''}`;
  const params = limit ? [accountId, limit] : [accountId];
  return (await pool.query(sql, params)).rows;
}

async function nextTransactionNumber() {
  const row = (await pool.query('SELECT COALESCE(MAX(transaction_number), 100000) AS "maxNum" FROM transactions')).rows[0];
  return row.maxNum + 1;
}

// Posts a transaction against an account and keeps its balance in sync.
// `amount` is always a positive magnitude; the sign of the balance
// adjustment is derived from `status` (see CREDIT_STATUSES above).
async function postTransaction(accountId, { counterpartyName, amount, status, notes, counterpartyAccountNumber, counterpartyRoutingNumber, relatedTransactionId, transactionDate }) {
  const transactionNumber = await nextTransactionNumber();
  const date = transactionDate || new Date().toISOString().slice(0, 10);

  const result = await pool.query(
    `INSERT INTO transactions (
      transaction_number, account_id, counterparty_name, transaction_date, amount, status,
      notes, counterparty_account_number, counterparty_routing_number, related_transaction_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [
      transactionNumber, accountId, counterpartyName, date, amount, status,
      notes || null, counterpartyAccountNumber || null, counterpartyRoutingNumber || null, relatedTransactionId || null
    ]
  );

  const delta = CREDIT_STATUSES.has(status) ? amount : -amount;
  await pool.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [delta, accountId]);

  return result.rows[0].id;
}

async function listBillPayPayees() {
  return (await pool.query('SELECT * FROM bill_pay_payees ORDER BY name')).rows;
}

async function addBillPayPayee(name, code) {
  await pool.query('INSERT INTO bill_pay_payees (name, code) VALUES ($1, $2)', [name, code]);
}

async function listFriendPayContacts() {
  return (await pool.query('SELECT * FROM friend_pay_contacts ORDER BY name')).rows;
}

async function addFriendPayContact(name, code) {
  await pool.query('INSERT INTO friend_pay_contacts (name, code) VALUES ($1, $2)', [name, code]);
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
