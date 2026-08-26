const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const banking = require('../lib/banking');

router.use(requireLogin);

router.get('/payees', async (req, res, next) => {
  try {
    res.render('billpay/payees', { title: 'Bill Pay Payees', payees: await banking.listBillPayPayees() });
  } catch (err) {
    next(err);
  }
});

router.get('/payees/new', (req, res) => {
  res.render('billpay/new-payee', { title: 'Add a Payee' });
});

router.post('/payees/new', async (req, res, next) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) {
      req.flash('error', 'Please enter a payee name');
      return res.redirect('/bill-pay/payees/new');
    }
    const code = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    await banking.addBillPayPayee(name, code);
    req.flash('success', `${name} added to your payees.`);
    res.redirect('/bill-pay/payees');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
