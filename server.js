require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const path = require('path');

const { ensureSchema, warmDb } = require('./config/database');
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

// injectLocals needs no DB (tag ID, flash, one-shot track event), so it runs
// first and the pages below can render without ever touching Neon.
app.use(injectLocals);

// Logged-out visitors on the marketing pages never need the database, so
// those requests skip it entirely. Neon scales to zero when idle and a cold
// wake-up can take seconds; blocking the HTML on it delays the CSQ tag
// (which lives in the HTML). Instead we kick off a non-blocking wake-up so
// the DB is usually warm by the time the visitor reaches /login.
const DB_FREE_GET = new Set([
  '/', '/about', '/features', '/account-types', '/contact',
  '/schedule-a-meeting', '/login', '/signup',
]);
const DB_FREE_POST = new Set(['/contact', '/schedule-a-meeting']);

app.use((req, res, next) => {
  const anonymous = !req.session.userId;
  const dbFree = (req.method === 'GET' && DB_FREE_GET.has(req.path)) ||
                 (req.method === 'POST' && DB_FREE_POST.has(req.path));
  if (anonymous && dbFree) {
    res.locals.currentUser = null;
    warmDb();
    return next();
  }
  next();
});

// Everything else (login submit, any logged-in page) needs the DB. Cached in
// config/database.js so the CREATE TABLE statements only run once per warm
// process; every cold start still guarantees the schema exists first.
app.use(async (req, res, next) => {
  if (res.locals.currentUser === null && !req.session.userId) return next();
  try {
    await ensureSchema();
    loadUser(req, res, next);
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
app.use('/admin/loans', require('./routes/admin/loans'));
app.use('/admin', require('./routes/admin/index'));

// Demo reset — clears the session so a fresh email can be typed at /login
app.get('/demo/reset', (req, res) => {
  req.session = null;
  res.redirect('/');
});

// Everyday banking activity (checking/savings, bill pay, friend pay) lives
// as a per-session overlay (see lib/banking.js) on top of a shared,
// read-only Postgres baseline, so "reset" just clears this session's own
// overlay rather than touching any shared state. Loan applications, which
// are genuinely per-identity, are untouched.
app.post('/demo/reset-data', (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
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
    console.log(`Admin: http://localhost:${PORT}/admin`);
  });
}

module.exports = app;
