const express = require('express');
const router = express.Router();
const { requireLogin, requireAdmin } = require('../../middleware/auth');
const loans = require('../../lib/loans');

router.use(requireLogin, requireAdmin);

router.get('/', (req, res) => {
  res.render('admin/loans', { title: 'Underwriting Queue', activePage: 'loans', applications: loans.listAll() });
});

router.get('/:id', (req, res) => {
  const loan = loans.getById(req.params.id);
  if (!loan) {
    req.flash('error', 'Loan application not found');
    return res.redirect('/admin/loans');
  }
  res.render('admin/loan-detail', { title: 'Loan Application', activePage: 'loans', loan, events: loans.listEvents(loan.id) });
});

router.post('/:id/advance', (req, res) => {
  const loan = loans.getById(req.params.id);
  if (loan) {
    const transition = loans.advance(loan, 'underwriting_sim');
    if (!transition) req.flash('info', 'This application cannot be advanced right now.');
  }
  res.redirect(`/admin/loans/${req.params.id}`);
});

module.exports = router;
