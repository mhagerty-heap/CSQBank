require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const path = require('path');

const { pool, ensureSchema } = require('./config/database');
const { loadUser } = require('./middleware/auth');
const injectLocals = require('./middleware/locals');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(methodOverride('_method'));

// Session cookie — intentionally no `secure` flag. TLS is terminated at the
// CDN/proxy edge on serverless platforms (Vercel etc.); the runtime always
// receives plain HTTP, so `secure:true` would silently prevent the cookie
// from being set. Same rationale as ecommerce-main.
app.use(cookieSession({
  name: 'sess',
  secret: 'csqbank2-demo-secret-key',
  httpOnly: true,
  sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000,
}));

// connect-flash expects req.session.save() — shim for cookie-session
app.use((req, res, next) => {
  if (!req.session.save) req.session.save = cb => { if (cb) cb(); };
  next();
});

app.use(flash());

app.use(injectLocals);
app.use((req, res, next) => { req.startedAt = Date.now(); next(); });

// Identity comes from the session cookie, so nothing outside /loans touches
// Postgres. Neon's compute stays asleep for marketing pages, login, and all
// everyday banking pages.
app.use(loadUser);

// Warm-up for automation (e.g. Selenium) to call before a loan run. Runs its
// own query (ensureSchema is memoized, so on a warm Lambda it would not touch
// Neon). A 200 means the Lambda is warm and Neon's compute is awake. Not a
// browser page, so it fires no CSQ tag.
app.get('/warm', async (req, res, next) => {
  try {
    await pool.query('SELECT 1');
    await ensureSchema();
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, db: 'ready', ms: Date.now() - req.startedAt });
  } catch (err) {
    next(err);
  }
});

app.use('/', require('./routes/marketing'));
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/index'));
app.use('/checking', require('./routes/checking'));
app.use('/savings', require('./routes/savings'));
app.use('/transfer', require('./routes/transfer'));
app.use('/bill-pay', require('./routes/billpay'));
app.use('/friend-pay', require('./routes/friendpay'));
app.use('/credit-card-offer', require('./routes/creditcard'));
app.use('/loans', require('./routes/loans'));
app.use('/api', require('./routes/demoErrors'));

// Demo reset — clears the session so a fresh email can be typed at /login
app.get('/demo/reset', (req, res) => {
  req.session = null;
  res.redirect('/');
});

// Everyday banking activity (checking/savings, bill pay, friend pay) lives
// as a per-session overlay (see lib/banking.js) on top of a shared,
// read-only baseline bundled in code (lib/baseline.js), so "reset" just clears
// this session's own overlay rather than touching any shared state. Loans,
// which live in Postgres, are untouched.
app.post('/demo/reset-data', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  req.session.bankingOverlay = null;
  req.flash('success', 'Your banking activity has been reset to the starting state.');
  res.redirect(req.get('Referer') || '/');
});

app.use((req, res) => {
  res.status(404).render('error', { title: '404 Not Found', message: 'The page you are looking for does not exist.', status: 404 });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { title: 'Server Error', message: err.message || 'Something went wrong.', status: 500 });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`CSQBank2 running at http://localhost:${PORT}`);
  });
}

module.exports = app;
