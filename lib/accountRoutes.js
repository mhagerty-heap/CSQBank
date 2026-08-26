const express = require('express');
const { requireLogin } = require('../middleware/auth');
const banking = require('../lib/banking');
const { queueTrackEvent } = require('../lib/trackEvent');

// Checking and savings are identical flows against different account types,
// so this factory builds one router shared by routes/checking.js and
// routes/savings.js instead of duplicating the same activity/deposit/pay-bill
// logic and views twice.
function makeAccountRouter(accountType, accountLabel) {
  const router = express.Router();
  router.use(requireLogin);

  function getAccount() {
    return banking.getAccountByType(accountType);
  }

  router.get('/activity', (req, res) => {
    const account = getAccount();
    const transactions = account ? banking.listTransactions(account.id) : [];
    res.render('account/activity', { title: `${accountLabel} Activity`, accountType, accountLabel, account, transactions });
  });

  router.get('/deposit', (req, res) => {
    res.render('account/deposit', { title: `${accountLabel} Deposit`, accountType, accountLabel });
  });

  router.post('/deposit', (req, res) => {
    const account = getAccount();
    const counterpartyName = (req.body.counterparty_name || '').trim();
    const amount = parseFloat(req.body.amount);

    if (!counterpartyName || !amount || amount <= 0) {
      req.flash('error', 'Please enter who the deposit is from and a valid amount');
      return res.redirect(`/${accountType}/deposit`);
    }

    banking.postTransaction(account.id, {
      counterpartyName,
      amount,
      status: 'received',
      notes: req.body.notes || '',
    });

    queueTrackEvent(req, 'Deposit Made', { accountType, amount });
    req.flash('success', `Deposit of $${amount.toFixed(2)} received.`);
    res.redirect(`/${accountType}/activity`);
  });

  router.get('/pay-bill', (req, res) => {
    const payees = banking.listBillPayPayees();
    res.render('account/pay-bill', { title: `${accountLabel} Pay Bill`, accountType, accountLabel, payees });
  });

  router.post('/pay-bill', (req, res) => {
    const account = getAccount();
    const payees = banking.listBillPayPayees();
    const payee = payees.find(p => p.code === req.body.payee_code);
    const amount = parseFloat(req.body.amount);

    if (!payee || !amount || amount <= 0) {
      req.flash('error', 'Please select a payee and enter a valid amount');
      return res.redirect(`/${accountType}/pay-bill`);
    }

    banking.postTransaction(account.id, {
      counterpartyName: payee.name,
      amount,
      status: 'paid',
      notes: req.body.notes || '',
      transactionDate: req.body.pay_date || undefined,
    });

    queueTrackEvent(req, 'Bill Paid', { accountType, payee: payee.name, amount });
    req.flash('success', `Paid $${amount.toFixed(2)} to ${payee.name}.`);
    res.redirect(`/${accountType}/activity`);
  });

  return router;
}

module.exports = makeAccountRouter;
