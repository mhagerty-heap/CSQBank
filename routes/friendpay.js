const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const banking = require('../lib/banking');
const { queueTrackEvent } = require('../lib/trackEvent');

router.use(requireLogin);

router.get('/', (req, res) => {
  res.render('friendpay/index', {
    title: 'Pay a Friend',
    contacts: banking.listFriendPayContacts(),
    accounts: banking.listAccounts(),
  });
});

router.post('/', (req, res) => {
  const contacts = banking.listFriendPayContacts();
  const contact = contacts.find(c => c.code === req.body.contact_code);
  const account = banking.getAccountByType(req.body.from_account_type);
  const amount = parseFloat(req.body.amount);

  if (!contact || !account || !amount || amount <= 0) {
    req.flash('error', 'Please choose a friend, a funding account, and a valid amount');
    return res.redirect('/friend-pay');
  }

  banking.postTransaction(account.id, {
    counterpartyName: contact.name,
    amount,
    status: 'friend_pay_out',
    notes: req.body.notes || '',
    transactionDate: req.body.pay_date || undefined,
  });

  queueTrackEvent(req, 'Friend Payment Sent', { accountType: account.account_type, friend: contact.name, amount });
  req.flash('success', `Sent $${amount.toFixed(2)} to ${contact.name}.`);
  res.redirect('/friend-pay');
});

router.get('/contacts/new', (req, res) => {
  res.render('friendpay/new-contact', { title: 'Add a Friend' });
});

router.post('/contacts/new', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) {
    req.flash('error', 'Please enter a name');
    return res.redirect('/friend-pay/contacts/new');
  }
  const code = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  banking.addFriendPayContact(name, code);
  req.flash('success', `${name} added to your friends.`);
  res.redirect('/friend-pay');
});

module.exports = router;
