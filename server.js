require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const path = require('path');

const { ensureSchema } = require('./config/database');
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

// Cached in config/database.js so this only actually runs the CREATE TABLE
// statements once per warm process — every cold start still guarantees the
// schema exists before any query below runs.
app.use(async (req, res, next) => {
  try {
    await ensureSchema();
    next();
  } catch (err) {
    next(err);
  }
});

app.use(loadUser);
app.use(injectLocals);

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
app.use('/admin/loans', require('./routes/admin/loans'));
app.use('/admin', require('./routes/admin/index'));

// Demo reset — clears the session so a fresh email can be typed at /login
app.get('/demo/reset', (req, res) => {
  req.session = null;
  res.redirect('/');
});

// Open to any logged-in user (not just admins) — resetting the shared demo
// banking sandbox back to its seeded state is a convenience for whoever is
// running a demo, not a privileged operation. Loan applications, which are
// genuinely per-identity, are untouched.
app.post('/demo/reset-data', async (req, res, next) => {
  if (!req.session.userId) return res.redirect('/login');
  try {
    await require('./lib/resetDemoData').resetSharedBankingData();
    req.flash('success', 'Shared banking data has been reset.');
    res.redirect(req.get('Referer') || '/');
  } catch (err) {
    next(err);
  }
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
