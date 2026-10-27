const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const { queueTrackEvent } = require('../lib/trackEvent');

router.use(requireLogin);

router.get('/', (req, res) => {
  res.render('creditcard/apply', { title: 'Credit Card Offer' });
});

router.post('/', (req, res, next) => {
  try {
    const { first_name, last_name, email, street, city, state, zip } = req.body;
    if (!first_name || !last_name || !email || !street || !city) {
      req.flash('error', 'Please fill in all required fields');
      return res.redirect('/credit-card-offer');
    }

    queueTrackEvent(req, 'Credit Card Application Submitted', { email });
    res.redirect('/credit-card-offer/thank-you');
  } catch (err) {
    next(err);
  }
});

router.get('/thank-you', (req, res) => {
  res.render('creditcard/thank-you', { title: 'Application Submitted' });
});

module.exports = router;
