const { pool } = require('../config/database');

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

async function loadUser(req, res, next) {
  try {
    if (req.session.userId) {
      const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.session.userId]);
      const user = rows[0] || null;
      res.locals.currentUser = user;
      if (!user) req.session.userId = null;
    } else {
      res.locals.currentUser = null;
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireLogin, requireAdmin, loadUser };
