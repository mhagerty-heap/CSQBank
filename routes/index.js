const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const banking = require('../lib/banking');
const loans = require('../lib/loans');

router.get('/', requireLogin, (req, res) => {
  const accounts = banking.listAccounts();
  const checking = accounts.find(a => a.account_type === 'checking');
  const savings = accounts.find(a => a.account_type === 'savings');

  const recentChecking = checking ? banking.listTransactions(checking.id, 5) : [];
  const recentSavings = savings ? banking.listTransactions(savings.id, 5) : [];

  const myLoans = loans.listForUser(req.session.userId);

  res.render('dashboard', {
    title: 'Dashboard',
    checking,
    savings,
    recentChecking,
    recentSavings,
    myLoans,
  });
});

module.exports = router;
