const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const loans = require('../lib/loans');
const { queueTrackEvent } = require('../lib/trackEvent');

router.use(requireLogin);

async function loadOwnLoan(req, res, next) {
  try {
    const loan = await loans.getById(req.params.id);
    if (!loan || loan.user_id !== req.session.userId) {
      req.flash('error', 'Loan application not found');
      return res.redirect('/loans');
    }
    req.loan = loan;
    next();
  } catch (err) {
    next(err);
  }
}

function fireTransitionEvent(req, transition) {
  if (!transition) return;
  queueTrackEvent(req, 'Loan Underwriting Stage Changed', { fromStatus: transition.fromStatus, toStatus: transition.toStatus });
  if (transition.toStatus === 'approved') {
    queueTrackEvent(req, 'Loan Application Approved', { loanId: req.loan.id });
  } else if (transition.toStatus === 'denied') {
    queueTrackEvent(req, 'Loan Application Denied', { loanId: req.loan.id });
  }
}

router.get('/', async (req, res, next) => {
  try {
    res.render('loans/index', { title: 'My Loans', applications: await loans.listForUser(req.session.userId) });
  } catch (err) {
    next(err);
  }
});

router.get('/new', async (req, res, next) => {
  try {
    const loanType = req.query.loan_type === 'auto' ? 'auto' : 'personal';
    const id = await loans.createDraft(req.session.userId, loanType);
    queueTrackEvent(req, 'Loan Application Started', { loanType });
    res.redirect(`/loans/${id}/edit?step=1`);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/edit', loadOwnLoan, (req, res) => {
  const step = parseInt(req.query.step, 10) || req.loan.current_step || 1;
  res.render('loans/edit', { title: 'Loan Application', loan: req.loan, step });
});

router.post('/:id/edit', loadOwnLoan, async (req, res, next) => {
  try {
    const step = parseInt(req.body.step, 10) || 1;

    if (step === 1) {
      await loans.updateDraft(req.loan.id, {
        loan_type: req.body.loan_type,
        requested_amount: parseFloat(req.body.requested_amount) || null,
        term_months: parseInt(req.body.term_months, 10) || null,
        purpose: req.body.purpose || null,
        current_step: 2,
      });
      return res.redirect(`/loans/${req.loan.id}/edit?step=2`);
    }

    if (step === 2) {
      await loans.updateDraft(req.loan.id, {
        occupation: req.body.occupation || null,
        annual_income_bracket: req.body.annual_income_bracket || null,
        net_worth_bracket: req.body.net_worth_bracket || null,
        current_step: 3,
      });
      return res.redirect(`/loans/${req.loan.id}/edit?step=3`);
    }

    // step 3: review & submit
    await loans.submit(req.loan);
    queueTrackEvent(req, 'Loan Application Submitted', {
      loanId: req.loan.id,
      loanType: req.loan.loan_type,
      requestedAmount: req.loan.requested_amount,
    });
    res.redirect(`/loans/${req.loan.id}`);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', loadOwnLoan, async (req, res, next) => {
  try {
    if (req.loan.status === 'draft') return res.redirect(`/loans/${req.loan.id}/edit?step=${req.loan.current_step}`);
    res.render('loans/detail', { title: 'Loan Application', loan: req.loan, events: await loans.listEvents(req.loan.id) });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/advance', loadOwnLoan, async (req, res, next) => {
  try {
    const transition = await loans.advance(req.loan, 'applicant');
    fireTransitionEvent(req, transition);
    if (!transition) req.flash('info', 'This application cannot be advanced right now.');
    res.redirect(`/loans/${req.loan.id}`);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/respond-docs', loadOwnLoan, async (req, res, next) => {
  try {
    const transition = await loans.respondToDocs(req.loan, 'applicant');
    if (transition) {
      queueTrackEvent(req, 'Loan Underwriting Stage Changed', transition);
      req.flash('success', 'Documents submitted for review.');
    }
    res.redirect(`/loans/${req.loan.id}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
