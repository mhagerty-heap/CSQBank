const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const db = require('../config/database');
const { queueTrackEvent } = require('../lib/trackEvent');

router.use(requireLogin);

router.get('/', (req, res) => {
  res.render('creditcard/apply', { title: 'Credit Card Offer' });
});

router.post('/', (req, res) => {
  const { first_name, last_name, email, street, city, state, zip } = req.body;
  if (!first_name || !last_name || !email || !street || !city) {
    req.flash('error', 'Please fill in all required fields');
    return res.redirect('/credit-card-offer');
  }

  db.prepare(`
    INSERT INTO credit_card_applications (
      first_name, middle_name, last_name, date_of_birth, phone, email,
      street, city, state, zip, country, residence_status,
      gross_monthly_income, monthly_housing_payment
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    first_name, req.body.middle_name || null, last_name, req.body.date_of_birth || null,
    req.body.phone || null, email, street, city, state || '', zip || '',
    req.body.country || 'US', req.body.residence_status || null,
    parseFloat(req.body.gross_monthly_income) || null, parseFloat(req.body.monthly_housing_payment) || null
  );

  queueTrackEvent(req, 'Credit Card Application Submitted', { email });
  res.redirect('/credit-card-offer/thank-you');
});

router.get('/thank-you', (req, res) => {
  res.render('creditcard/thank-you', { title: 'Application Submitted' });
});

module.exports = router;
