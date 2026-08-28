const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const banking = require('../lib/banking');
const { queueTrackEvent } = require('../lib/trackEvent');

router.use(requireLogin);

router.get('/', async (req, res, next) => {
  try {
    res.render('transfer/index', { title: 'Make a Transfer', accounts: await banking.listAccounts(req) });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { from_account_type, to_account_type } = req.body;
    const amount = parseFloat(req.body.amount);

    if (!from_account_type || !to_account_type || from_account_type === to_account_type || !amount || amount <= 0) {
      req.flash('error', 'Please choose two different accounts and a valid amount');
      return res.redirect('/transfer');
    }

    const fromAccount = await banking.getAccountByType(req, from_account_type);
    const toAccount = await banking.getAccountByType(req, to_account_type);

    banking.postTransaction(req, from_account_type, {
      counterpartyName: toAccount.display_label,
      amount,
      status: 'transferred_out',
    });
    banking.postTransaction(req, to_account_type, {
      counterpartyName: fromAccount.display_label,
      amount,
      status: 'transferred_in',
    });

    queueTrackEvent(req, 'Transfer Completed', { fromAccountType: from_account_type, toAccountType: to_account_type, amount });
    req.flash('success', `Transferred $${amount.toFixed(2)} from ${fromAccount.display_label} to ${toAccount.display_label}.`);
    res.redirect('/transfer');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
