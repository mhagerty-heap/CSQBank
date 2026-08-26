const express = require('express');
const router = express.Router();
const { requireLogin, requireAdmin } = require('../../middleware/auth');
const db = require('../../config/database');
const { resetSharedBankingData } = require('../../lib/resetDemoData');

router.get('/', requireLogin, requireAdmin, (req, res) => {
  const stats = {
    totalTransactions: db.prepare('SELECT COUNT(*) AS n FROM transactions').get().n,
    totalUsers: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
    openLoanApplications: db.prepare(`
      SELECT COUNT(*) AS n FROM loan_applications
      WHERE status NOT IN ('draft', 'approved', 'denied')
    `).get().n,
    decidedLoanApplications: db.prepare(`
      SELECT COUNT(*) AS n FROM loan_applications WHERE status IN ('approved', 'denied')
    `).get().n,
  };

  const recentLoans = db.prepare(`
    SELECT la.*, u.email AS applicant_email
    FROM loan_applications la
    JOIN users u ON u.id = la.user_id
    ORDER BY la.updated_at DESC
    LIMIT 5
  `).all();

  res.render('admin/dashboard', { title: 'Admin Dashboard', activePage: 'dashboard', stats, recentLoans });
});

router.post('/reset-demo-data', requireLogin, requireAdmin, (req, res) => {
  resetSharedBankingData();
  req.flash('success', 'Shared banking data (accounts, activity, payees, contacts) has been reset. Loan applications are untouched.');
  res.redirect('/admin');
});

module.exports = router;
