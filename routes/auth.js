const express = require('express');
const router = express.Router();
const db = require('../config/database');

router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('marketing/login', { title: 'Log In' });
});

router.get('/signup', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('marketing/signup', { title: 'Open an Account' });
});

// Shared by both the marketing "Open an Account" form and the app "Log In"
// form. Deliberately frictionless: any email logs in — a new email
// auto-provisions a persona, an existing one logs back into it. The
// password field (present on both forms for visual realism) is read and
// discarded, never checked or stored. This is an intentional demo-only
// tradeoff, not an oversight, so SCs can run a live demo without needing to
// remember or share credentials, and can demo Heap identify() with any
// email typed on the spot.
router.post('/login', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!email) {
    req.flash('error', 'Please enter an email address');
    return res.redirect(req.get('Referer') || '/login');
  }

  let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    const name = (req.body.name || '').trim() || email.split('@')[0];
    const result = db.prepare('INSERT INTO users (email, name) VALUES (?, ?)').run(email, name);
    user = { id: result.lastInsertRowid, email, name, role: 'customer' };
    req.flash('success', `Welcome, ${name}! Your account is ready.`);
  } else {
    req.flash('success', `Welcome back, ${user.name}!`);
  }

  req.session.userId = user.id;
  req.session.user = { id: user.id, email: user.email, name: user.name, role: user.role };
  const returnTo = req.session.returnTo || '/';
  delete req.session.returnTo;
  res.redirect(returnTo);
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.redirect('/');
});

module.exports = router;
