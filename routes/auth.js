const express = require('express');
const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('marketing/login', { title: 'Log In' });
});

router.get('/signup', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('marketing/signup', { title: 'Open an Account' });
});

// There's no user table to remember a name in, so when the form doesn't send
// one (the Log In form has no name field) a readable display name is derived
// from the email: carol.carpenter+demo@x.com -> "Carol Carpenter".
function nameFromEmail(email) {
  const local = email.split('@')[0].split('+')[0];
  const words = local.split(/[._-]+/).map(w => w.replace(/\d+$/, '')).filter(Boolean);
  if (!words.length) return local;
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Shared by both the marketing "Open an Account" form and the app "Log In"
// form. Deliberately frictionless: any email logs in — a new email
// auto-provisions a persona, an existing one logs back into it. The
// password field (present on both forms for visual realism) is read and
// discarded, never checked or stored. This is an intentional demo-only
// tradeoff, not an oversight, so SCs can run a live demo without needing to
// remember or share credentials, and can demo Heap identify() with any
// email typed on the spot.
router.post('/login', (req, res, next) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email) {
      req.flash('error', 'Please enter an email address');
      return res.redirect(req.get('Referer') || '/login');
    }

    const name = (req.body.name || '').trim() || nameFromEmail(email);
    req.session.user = { email, name };
    req.flash('success', `Welcome, ${name}!`);
    const returnTo = req.session.returnTo || '/';
    delete req.session.returnTo;
    res.redirect(returnTo);
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.redirect('/');
});

module.exports = router;
