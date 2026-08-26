const express = require('express');
const router = express.Router();
const { requireLogin, requireAdmin } = require('../../middleware/auth');
const { pool } = require('../../config/database');
const { resetSharedBankingData } = require('../../lib/resetDemoData');

router.get('/', requireLogin, requireAdmin, async (req, res, next) => {
  try {
    const [totalTransactions, totalUsers, openLoanApplications, decidedLoanApplications, recentLoans] = await Promise.all([
      pool.query('SELECT COUNT(*) AS n FROM transactions'),
      pool.query('SELECT COUNT(*) AS n FROM users'),
      pool.query(`SELECT COUNT(*) AS n FROM loan_applications WHERE status NOT IN ('draft', 'approved', 'denied')`),
      pool.query(`SELECT COUNT(*) AS n FROM loan_applications WHERE status IN ('approved', 'denied')`),
      pool.query(`
        SELECT la.*, u.email AS applicant_email
        FROM loan_applications la
        JOIN users u ON u.id = la.user_id
        ORDER BY la.updated_at DESC
        LIMIT 5
      `),
    ]);

    const stats = {
      totalTransactions: parseInt(totalTransactions.rows[0].n, 10),
      totalUsers: parseInt(totalUsers.rows[0].n, 10),
      openLoanApplications: parseInt(openLoanApplications.rows[0].n, 10),
      decidedLoanApplications: parseInt(decidedLoanApplications.rows[0].n, 10),
    };

    res.render('admin/dashboard', { title: 'Admin Dashboard', activePage: 'dashboard', stats, recentLoans: recentLoans.rows });
  } catch (err) {
    next(err);
  }
});

router.post('/reset-demo-data', requireLogin, requireAdmin, async (req, res, next) => {
  try {
    await resetSharedBankingData();
    req.flash('success', 'Shared banking data (accounts, activity, payees, contacts) has been reset. Loan applications are untouched.');
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
