const { pool } = require('../config/database');

const COUNTERPARTIES = [
  'Whole Foods Market', 'Amazon.com', 'Shell Oil', 'Netflix', 'Starbucks',
  'Target', 'Uber', 'Employer Payroll', 'AT&T Wireless', 'Trader Joe\'s',
  'Delta Air Lines', 'Home Depot', 'Spotify', 'CVS Pharmacy', 'Costco',
];

const BILL_PAY_PAYEES = [
  { name: 'Star Gas & Oil', code: 'star-gas-oil' },
  { name: 'Northstar Mortgage', code: 'northstar-mortgage' },
  { name: 'Metro Power & Light', code: 'metro-power-light' },
  { name: 'City Water Utility', code: 'city-water-utility' },
];

const FRIEND_PAY_CONTACTS = [
  { name: 'Carol Carpenter', code: 'carol-carpenter' },
  { name: 'Richard Jones', code: 'richard-jones' },
  { name: 'Alfred Bundy', code: 'alfred-bundy' },
  { name: 'John Smith', code: 'john-smith' },
];

function randomAccountNumber() {
  return String(Math.floor(1000000000 + Math.random() * 9000000000));
}

function randomRoutingNumber() {
  return String(Math.floor(10000000 + Math.random() * 90000000));
}

async function seedTransactions(accountId, seedBalance) {
  const statuses = ['received', 'paid', 'transferred_in', 'transferred_out', 'friend_pay_in', 'friend_pay_out'];

  let balance = seedBalance;
  const now = Date.now();
  for (let i = 0; i < 50; i++) {
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const amount = Math.round((Math.random() * 400 + 5) * 100) / 100;
    const isCredit = status === 'received' || status === 'transferred_in' || status === 'friend_pay_in';
    balance += isCredit ? amount : -amount;
    const daysAgo = 50 - i;
    const date = new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    await pool.query(
      `INSERT INTO transactions (
        transaction_number, account_id, counterparty_name, transaction_date, amount, status,
        counterparty_account_number, counterparty_routing_number
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        200000 + accountId * 1000 + i,
        accountId,
        COUNTERPARTIES[Math.floor(Math.random() * COUNTERPARTIES.length)],
        date,
        amount,
        status,
        randomAccountNumber(),
        randomRoutingNumber(),
      ]
    );
  }
  await pool.query('UPDATE accounts SET balance = $1 WHERE id = $2', [Math.round(balance * 100) / 100, accountId]);
}

// Seeds the shared, read-only banking baseline (accounts, activity, payees,
// contacts, credit card applications) that lib/banking.js layers each
// session's own overlay on top of — see that file's module comment. Only
// ever needs to run once via `npm run seed`, not on every demo reset;
// `users` and `loan_applications` are untouched either way, since those
// are the one genuinely per-identity, persisted-over-time part of the demo.
async function resetSharedBankingData() {
  await pool.query(`
    DELETE FROM transactions;
    DELETE FROM accounts;
    DELETE FROM bill_pay_payees;
    DELETE FROM friend_pay_contacts;
    DELETE FROM credit_card_applications;
  `);

  const checking = (await pool.query(
    `INSERT INTO accounts (account_type, display_label, account_number, routing_number, balance)
     VALUES ('checking', 'Checking (XX91)', $1, $2, 0) RETURNING id`,
    [randomAccountNumber(), randomRoutingNumber()]
  )).rows[0];

  const savings = (await pool.query(
    `INSERT INTO accounts (account_type, display_label, account_number, routing_number, balance)
     VALUES ('savings', 'Savings (XX45)', $1, $2, 0) RETURNING id`,
    [randomAccountNumber(), randomRoutingNumber()]
  )).rows[0];

  await seedTransactions(checking.id, 4500);
  await seedTransactions(savings.id, 1000);

  for (const p of BILL_PAY_PAYEES) {
    await pool.query('INSERT INTO bill_pay_payees (name, code) VALUES ($1, $2)', [p.name, p.code]);
  }

  for (const c of FRIEND_PAY_CONTACTS) {
    await pool.query('INSERT INTO friend_pay_contacts (name, code) VALUES ($1, $2)', [c.name, c.code]);
  }
}

module.exports = { resetSharedBankingData };
