const express = require('express');
const router = express.Router();

// Logged-out visitors see the marketing home page; logged-in users fall
// through to routes/index.js's dashboard handler for the same '/' path.
router.get('/', (req, res, next) => {
  if (req.session.userId) return next();
  res.render('marketing/home');
});

router.get('/about', (req, res) => {
  res.render('marketing/about', { title: 'About Us' });
});

router.get('/features', (req, res) => {
  res.render('marketing/features', { title: 'Features' });
});

router.get('/account-types', (req, res) => {
  res.render('marketing/account-types', { title: 'Account Types' });
});

router.get('/contact', (req, res) => {
  res.render('marketing/contact', { title: 'Contact Us' });
});

router.post('/contact', (req, res) => {
  req.flash('success', "Thanks for reaching out — a CSQBank representative will be in touch shortly.");
  res.redirect('/contact');
});

router.get('/schedule-a-meeting', (req, res) => {
  res.render('marketing/schedule-a-meeting', { title: 'Schedule a Meeting' });
});

router.post('/schedule-a-meeting', (req, res) => {
  req.flash('success', "Thanks — we've received your request and will confirm a time soon.");
  res.redirect('/schedule-a-meeting');
});

module.exports = router;
