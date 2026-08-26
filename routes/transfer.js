const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const banking = require('../lib/banking');
const { queueTrackEvent } = require('../lib/trackEvent');

router.use(requireLogin);

router.get('/', (req, res) => {
  res.render('transfer/index', { title: 'Make a Transfer', accounts: banking.listAccounts() });
});

router.post('/', (req, res) => {
  const { from_account_type, to_account_type } = req.body;
  const amount = parseFloat(req.body.amount);

  if (!from_account_type || !to_account_type || from_account_type === to_account_type || !amount || amount <= 0) {
    req.flash('error', 'Please choose two different accounts and a valid amount');
    return res.redirect('/transfer');
  }

  const fromAccount = banking.getAccountByType(from_account_type);
  const toAccount = banking.getAccountByType(to_account_type);

  const outId = banking.postTransaction(fromAccount.id, {
    counterpartyName: toAccount.display_label,
    amount,
    status: 'transferred_out',
    counterpartyAccountNumber: toAccount.account_number,
    counterpartyRoutingNumber: toAccount.routing_number,
  });
  banking.postTransaction(toAccount.id, {
    counterpartyName: fromAccount.display_label,
    amount,
    status: 'transferred_in',
    counterpartyAccountNumber: fromAccount.account_number,
    counterpartyRoutingNumber: fromAccount.routing_number,
    relatedTransactionId: outId,
  });

  queueTrackEvent(req, 'Transfer Completed', { fromAccountType: from_account_type, toAccountType: to_account_type, amount });
  req.flash('success', `Transferred $${amount.toFixed(2)} from ${fromAccount.display_label} to ${toAccount.display_label}.`);
  res.redirect('/transfer');
});

module.exports = router;
