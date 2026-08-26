const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const loans = require('../lib/loans');
const { queueTrackEvent } = require('../lib/trackEvent');

router.use(requireLogin);

// Caches the full loan row in the session cookie (client-side, so it
// survives a switch to a different serverless instance) after every
// create/read/mutation, so loadOwnLoan can recreate the row locally below
// if this instance's ephemeral copy of the DB never saw the original write.
function cacheLoan(req, loan) {
  req.session.loanCache = req.session.loanCache || {};
  req.session.loanCache[loan.id] = loan;
}

function loadOwnLoan(req, res, next) {
  let loan = loans.getById(req.params.id);

  if (!loan && req.session.loanCache && req.session.loanCache[req.params.id]) {
    loans.recreate(req.session.loanCache[req.params.id]);
    loan = loans.getById(req.params.id);
  }

  if (!loan || loan.user_id !== req.session.userId) {
    req.flash('error', 'Loan application not found');
    return res.redirect('/loans');
  }
  req.loan = loan;
  cacheLoan(req, loan);
  next();
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

router.get('/', (req, res) => {
  let applications = loans.listForUser(req.session.userId);

  // Same cross-instance recreation as loadOwnLoan — fold in any of the
  // user's own loans this instance's DB copy hasn't seen yet.
  const seen = new Set(applications.map(l => l.id));
  const cached = req.session.loanCache || {};
  let recreatedAny = false;
  Object.values(cached).forEach(loan => {
    if (loan.user_id === req.session.userId && !seen.has(loan.id)) {
      loans.recreate(loan);
      seen.add(loan.id);
      recreatedAny = true;
    }
  });
  if (recreatedAny) applications = loans.listForUser(req.session.userId);

  res.render('loans/index', { title: 'My Loans', applications });
});

router.get('/new', (req, res) => {
  const loanType = req.query.loan_type === 'auto' ? 'auto' : 'personal';
  const id = loans.createDraft(req.session.userId, loanType);
  cacheLoan(req, loans.getById(id));
  queueTrackEvent(req, 'Loan Application Started', { loanType });
  res.redirect(`/loans/${id}/edit?step=1`);
});

router.get('/:id/edit', loadOwnLoan, (req, res) => {
  const step = parseInt(req.query.step, 10) || req.loan.current_step || 1;
  res.render('loans/edit', { title: 'Loan Application', loan: req.loan, step });
});

router.post('/:id/edit', loadOwnLoan, (req, res) => {
  const step = parseInt(req.body.step, 10) || 1;

  if (step === 1) {
    loans.updateDraft(req.loan.id, {
      loan_type: req.body.loan_type,
      requested_amount: parseFloat(req.body.requested_amount) || null,
      term_months: parseInt(req.body.term_months, 10) || null,
      purpose: req.body.purpose || null,
      current_step: 2,
    });
    cacheLoan(req, loans.getById(req.loan.id));
    return res.redirect(`/loans/${req.loan.id}/edit?step=2`);
  }

  if (step === 2) {
    loans.updateDraft(req.loan.id, {
      occupation: req.body.occupation || null,
      annual_income_bracket: req.body.annual_income_bracket || null,
      net_worth_bracket: req.body.net_worth_bracket || null,
      current_step: 3,
    });
    cacheLoan(req, loans.getById(req.loan.id));
    return res.redirect(`/loans/${req.loan.id}/edit?step=3`);
  }

  // step 3: review & submit
  loans.submit(req.loan);
  cacheLoan(req, loans.getById(req.loan.id));
  queueTrackEvent(req, 'Loan Application Submitted', {
    loanId: req.loan.id,
    loanType: req.loan.loan_type,
    requestedAmount: req.loan.requested_amount,
  });
  res.redirect(`/loans/${req.loan.id}`);
});

router.get('/:id', loadOwnLoan, (req, res) => {
  if (req.loan.status === 'draft') return res.redirect(`/loans/${req.loan.id}/edit?step=${req.loan.current_step}`);
  res.render('loans/detail', { title: 'Loan Application', loan: req.loan, events: loans.listEvents(req.loan.id) });
});

router.post('/:id/advance', loadOwnLoan, (req, res) => {
  const transition = loans.advance(req.loan, 'applicant');
  cacheLoan(req, loans.getById(req.loan.id));
  fireTransitionEvent(req, transition);
  if (!transition) req.flash('info', 'This application cannot be advanced right now.');
  res.redirect(`/loans/${req.loan.id}`);
});

router.post('/:id/respond-docs', loadOwnLoan, (req, res) => {
  const transition = loans.respondToDocs(req.loan, 'applicant');
  cacheLoan(req, loans.getById(req.loan.id));
  if (transition) {
    queueTrackEvent(req, 'Loan Underwriting Stage Changed', transition);
    req.flash('success', 'Documents submitted for review.');
  }
  res.redirect(`/loans/${req.loan.id}`);
});

module.exports = router;
