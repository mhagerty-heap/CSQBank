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

  router.get('/activity', async (req, res, next) => {
    try {
      const account = await getAccount();
      const transactions = account ? await banking.listTransactions(account.id) : [];
      res.render('account/activity', { title: `${accountLabel} Activity`, accountType, accountLabel, account, transactions });
    } catch (err) {
      next(err);
    }
  });

  router.get('/deposit', (req, res) => {
    res.render('account/deposit', { title: `${accountLabel} Deposit`, accountType, accountLabel });
  });

  router.post('/deposit', async (req, res, next) => {
    try {
      const account = await getAccount();
      const counterpartyName = (req.body.counterparty_name || '').trim();
      const amount = parseFloat(req.body.amount);

      if (!counterpartyName || !amount || amount <= 0) {
        req.flash('error', 'Please enter who the deposit is from and a valid amount');
        return res.redirect(`/${accountType}/deposit`);
      }

      await banking.postTransaction(account.id, {
        counterpartyName,
        amount,
        status: 'received',
        notes: req.body.notes || '',
      });

      queueTrackEvent(req, 'Deposit Made', { accountType, amount });
      req.flash('success', `Deposit of $${amount.toFixed(2)} received.`);
      res.redirect(`/${accountType}/activity`);
    } catch (err) {
      next(err);
    }
  });

  router.get('/pay-bill', async (req, res, next) => {
    try {
      const payees = await banking.listBillPayPayees();
      res.render('account/pay-bill', { title: `${accountLabel} Pay Bill`, accountType, accountLabel, payees });
    } catch (err) {
      next(err);
    }
  });

  router.post('/pay-bill', async (req, res, next) => {
    try {
      const account = await getAccount();
      const payees = await banking.listBillPayPayees();
      const payee = payees.find(p => p.code === req.body.payee_code);
      const amount = parseFloat(req.body.amount);

      if (!payee || !amount || amount <= 0) {
        req.flash('error', 'Please select a payee and enter a valid amount');
        return res.redirect(`/${accountType}/pay-bill`);
      }

      await banking.postTransaction(account.id, {
        counterpartyName: payee.name,
        amount,
        status: 'paid',
        notes: req.body.notes || '',
        transactionDate: req.body.pay_date || undefined,
      });

      queueTrackEvent(req, 'Bill Paid', { accountType, payee: payee.name, amount });
      req.flash('success', `Paid $${amount.toFixed(2)} to ${payee.name}.`);
      res.redirect(`/${accountType}/activity`);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = makeAccountRouter;
