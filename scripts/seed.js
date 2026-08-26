require('../config/database'); // ensures schema exists
const { resetSharedBankingData } = require('../lib/resetDemoData');

resetSharedBankingData();
console.log('Seeded shared demo banking data (accounts, activity, payees, contacts).');
