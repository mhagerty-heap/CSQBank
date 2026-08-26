const { pool, ensureSchema } = require('../config/database');
const { resetSharedBankingData } = require('../lib/resetDemoData');

(async () => {
  await ensureSchema();
  await resetSharedBankingData();
  console.log('Seeded shared demo banking data (accounts, activity, payees, contacts).');
  await pool.end();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
