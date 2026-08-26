const db = require('../config/database');

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    req.flash('error', 'Please log in to continue');
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!res.locals.currentUser || res.locals.currentUser.role !== 'admin') {
    return res.status(403).render('error', { title: 'Forbidden', message: 'Access denied. Admin only.', status: 403 });
  }
  next();
}

function loadUser(req, res, next) {
  if (req.session.userId) {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
    res.locals.currentUser = user || null;
    if (!user) req.session.userId = null;
  } else {
    res.locals.currentUser = null;
  }
  next();
}

module.exports = { requireLogin, requireAdmin, loadUser };
