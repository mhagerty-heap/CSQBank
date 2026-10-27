const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const banking = require('../lib/banking');

router.get('/banking', requireLogin, async (req, res, next) => {
  try {
    const accounts = await banking.listAccounts(req);
    const checking = accounts.find(a => a.account_type === 'checking');
    const savings = accounts.find(a => a.account_type === 'savings');

    const [recentChecking, recentSavings] = await Promise.all([
      banking.listTransactions(req, checking, 5),
      banking.listTransactions(req, savings, 5),
    ]);

    res.render('dashboard', {
      title: 'Dashboard',
      checking,
      savings,
      recentChecking,
      recentSavings,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
