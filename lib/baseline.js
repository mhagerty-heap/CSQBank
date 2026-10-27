// The shared, read-only banking baseline (accounts, activity, payees,
// contacts) that lib/banking.js layers each session's own overlay on top of.
// It lives in code, not in Postgres, so browsing never touches the database.
//
// Generated once per process from a fixed seed, so every instance and every
// session sees the identical data; only the dates move (they're relative to
// "today", so the activity always looks recent).

const COUNTERPARTIES = [
  'Whole Foods Market', 'Amazon.com', 'Shell Oil', 'Netflix', 'Starbucks',
  'Target', 'Uber', 'Employer Payroll', 'AT&T Wireless', 'Trader Joe\'s',
  'Delta Air Lines', 'Home Depot', 'Spotify', 'CVS Pharmacy', 'Costco',
];

const STATUSES = ['received', 'paid', 'transferred_in', 'transferred_out', 'friend_pay_in', 'friend_pay_out'];
const CREDIT_STATUSES = new Set(['received', 'transferred_in', 'friend_pay_in']);

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

// Small deterministic PRNG (mulberry32) so the baseline is identical on every
// serverless instance.
function makeRandom(seed) {
  let a = seed;
  return function random() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = makeRandom(20260826);

function digits(count) {
  const min = Math.pow(10, count - 1);
  return String(Math.floor(min + random() * 9 * min));
}

function buildTransactions(accountId, seedBalance) {
  const transactions = [];
  let balance = seedBalance;
  const now = Date.now();
  for (let i = 0; i < 50; i++) {
    const status = STATUSES[Math.floor(random() * STATUSES.length)];
    const amount = Math.round((random() * 400 + 5) * 100) / 100;
    balance += CREDIT_STATUSES.has(status) ? amount : -amount;
    const daysAgo = 50 - i;
    transactions.push({
      id: accountId * 1000 + i,
      transaction_number: 200000 + accountId * 1000 + i,
      account_id: accountId,
      counterparty_name: COUNTERPARTIES[Math.floor(random() * COUNTERPARTIES.length)],
      transaction_date: new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      amount,
      status,
      notes: null,
      counterparty_account_number: digits(10),
      counterparty_routing_number: digits(8),
    });
  }
  // Newest first, matching the ORDER BY the Postgres query used to apply.
  transactions.sort((x, y) => (x.transaction_date < y.transaction_date ? 1 : x.transaction_date > y.transaction_date ? -1 : y.id - x.id));
  return { transactions, balance: Math.round(balance * 100) / 100 };
}

const checkingData = buildTransactions(1, 4500);
const savingsData = buildTransactions(2, 1000);

const accounts = [
  {
    id: 1, account_type: 'checking', display_label: 'Checking (XX91)',
    account_number: digits(10), routing_number: digits(8), balance: checkingData.balance, status: 'active',
  },
  {
    id: 2, account_type: 'savings', display_label: 'Savings (XX45)',
    account_number: digits(10), routing_number: digits(8), balance: savingsData.balance, status: 'active',
  },
];

const transactionsByAccountId = {
  1: checkingData.transactions,
  2: savingsData.transactions,
};

module.exports = { accounts, transactionsByAccountId, BILL_PAY_PAYEES, FRIEND_PAY_CONTACTS };
