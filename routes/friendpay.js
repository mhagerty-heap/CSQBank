const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const banking = require('../lib/banking');
const { queueTrackEvent } = require('../lib/trackEvent');

router.use(requireLogin);

router.get('/', async (req, res, next) => {
  try {
    const [contacts, accounts] = await Promise.all([
      banking.listFriendPayContacts(req),
      banking.listAccounts(req),
    ]);
    res.render('friendpay/index', { title: 'Pay a Friend', contacts, accounts });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const contacts = await banking.listFriendPayContacts(req);
    const contact = contacts.find(c => c.code === req.body.contact_code);
    const account = await banking.getAccountByType(req, req.body.from_account_type);
    const amount = parseFloat(req.body.amount);

    if (!contact || !account || !amount || amount <= 0) {
      req.flash('error', 'Please choose a friend, a funding account, and a valid amount');
      return res.redirect('/friend-pay');
    }

    banking.postTransaction(req, account.account_type, {
      counterpartyName: contact.name,
      amount,
      status: 'friend_pay_out',
      notes: req.body.notes || '',
      transactionDate: req.body.pay_date || undefined,
    });

    queueTrackEvent(req, 'Friend Payment Sent', { accountType: account.account_type, friend: contact.name, amount });
    req.flash('success', `Sent $${amount.toFixed(2)} to ${contact.name}.`);
    res.redirect('/friend-pay');
  } catch (err) {
    next(err);
  }
});

router.get('/contacts/new', (req, res) => {
  res.render('friendpay/new-contact', { title: 'Add a Friend' });
});

router.post('/contacts/new', (req, res, next) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) {
      req.flash('error', 'Please enter a name');
      return res.redirect('/friend-pay/contacts/new');
    }
    const code = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    banking.addFriendPayContact(req, name, code);
    req.flash('success', `${name} added to your friends.`);
    res.redirect('/friend-pay');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
