const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const banking = require('../lib/banking');
const loans = require('../lib/loans');

router.get('/', requireLogin, async (req, res, next) => {
  try {
    const accounts = await banking.listAccounts();
    const checking = accounts.find(a => a.account_type === 'checking');
    const savings = accounts.find(a => a.account_type === 'savings');

    const [recentChecking, recentSavings, myLoans] = await Promise.all([
      checking ? banking.listTransactions(checking.id, 5) : [],
      savings ? banking.listTransactions(savings.id, 5) : [],
      loans.listForUser(req.session.userId),
    ]);

    res.render('dashboard', {
      title: 'Dashboard',
      checking,
      savings,
      recentChecking,
      recentSavings,
      myLoans,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
