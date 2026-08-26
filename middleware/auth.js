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
    let user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);

    // On serverless platforms (Vercel), each instance gets its own ephemeral
    // copy of bank.db (see config/database.js) — a user created on one
    // instance won't exist on another. The session cookie itself carries
    // enough identity to recreate that row locally, so login state survives
    // the switch and later FK-dependent writes (e.g. loan applications)
    // still succeed.
    if (!user && req.session.user) {
      const cached = req.session.user;
      db.prepare('INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)')
        .run(cached.id, cached.email, cached.name, cached.role);
      user = cached;
    }

    if (user) {
      res.locals.currentUser = user;
      req.session.user = { id: user.id, email: user.email, name: user.name, role: user.role };
    } else {
      res.locals.currentUser = null;
      req.session.userId = null;
    }
  } else {
    res.locals.currentUser = null;
  }
  next();
}

module.exports = { requireLogin, requireAdmin, loadUser };
