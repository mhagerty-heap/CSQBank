// Identity lives entirely in the signed session cookie (req.session.user =
// { email, name }); there is no users table and no database lookup here.
function requireLogin(req, res, next) {
  if (!req.session.user) {
    req.flash('error', 'Please log in to continue');
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }
  next();
}

function loadUser(req, res, next) {
  res.locals.currentUser = req.session.user || null;
  next();
}

module.exports = { requireLogin, loadUser };
