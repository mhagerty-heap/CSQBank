const express = require('express');
const router = express.Router();
const { requireLogin, requireAdmin } = require('../../middleware/auth');
const loans = require('../../lib/loans');

router.use(requireLogin, requireAdmin);

router.get('/', async (req, res, next) => {
  try {
    res.render('admin/loans', { title: 'Underwriting Queue', activePage: 'loans', applications: await loans.listAll() });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const loan = await loans.getById(req.params.id);
    if (!loan) {
      req.flash('error', 'Loan application not found');
      return res.redirect('/admin/loans');
    }
    res.render('admin/loan-detail', { title: 'Loan Application', activePage: 'loans', loan, events: await loans.listEvents(loan.id) });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/advance', async (req, res, next) => {
  try {
    const loan = await loans.getById(req.params.id);
    if (loan) {
      const transition = await loans.advance(loan, 'underwriting_sim');
      if (!transition) req.flash('info', 'This application cannot be advanced right now.');
    }
    res.redirect(`/admin/loans/${req.params.id}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
