const { pool } = require('../config/database');

// State machine:
//   draft -> submitted -> under_review <-> docs_requested -> docs_submitted -> under_review -> approved | denied
const ADVANCEABLE_FROM = new Set(['submitted', 'under_review', 'docs_submitted']);

async function getById(id) {
  return (await pool.query('SELECT * FROM loan_applications WHERE id = $1', [id])).rows[0];
}

async function listForUser(userId) {
  return (await pool.query('SELECT * FROM loan_applications WHERE user_id = $1 ORDER BY created_at DESC', [userId])).rows;
}

async function listAll() {
  return (await pool.query(`
    SELECT la.*, u.email AS applicant_email, u.name AS applicant_name
    FROM loan_applications la
    JOIN users u ON u.id = la.user_id
    ORDER BY la.updated_at DESC
  `)).rows;
}

async function listEvents(loanApplicationId) {
  return (await pool.query('SELECT * FROM loan_application_events WHERE loan_application_id = $1 ORDER BY id ASC', [loanApplicationId])).rows;
}

async function createDraft(userId, loanType) {
  const result = await pool.query(
    `INSERT INTO loan_applications (user_id, loan_type, current_step, status)
     VALUES ($1, $2, 1, 'draft') RETURNING id`,
    [userId, loanType]
  );
  return result.rows[0].id;
}

async function updateDraft(id, fields) {
  const cols = Object.keys(fields);
  if (!cols.length) return;
  const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
  await pool.query(
    `UPDATE loan_applications SET ${setClause}, updated_at = NOW() WHERE id = $${cols.length + 1}`,
    [...cols.map(c => fields[c]), id]
  );
}

async function logEvent(loanApplicationId, fromStatus, toStatus, actor, note) {
  await pool.query(
    `INSERT INTO loan_application_events (loan_application_id, from_status, to_status, actor, note)
     VALUES ($1, $2, $3, $4, $5)`,
    [loanApplicationId, fromStatus, toStatus, actor, note || null]
  );
}

async function submit(loan) {
  await pool.query(
    `UPDATE loan_applications SET status = 'submitted', submitted_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [loan.id]
  );
  await logEvent(loan.id, loan.status, 'submitted', 'applicant', 'Application submitted for underwriting');
  return 'submitted';
}

// Rough APR banding for demo purposes only, not a real underwriting model.
function assignApr(loan) {
  const base = loan.loan_type === 'auto' ? 6.5 : 9.5;
  const amountPenalty = Math.min(loan.requested_amount / 10000, 4);
  const jitter = Math.random() * 3;
  return Math.round((base + amountPenalty + jitter) * 100) / 100;
}

// Moves a loan application forward exactly one step for the manual demo
// "Advance" control. Returns { fromStatus, toStatus, note } describing what
// happened, or null if the application isn't in an advanceable state.
async function advance(loan, actor) {
  if (!ADVANCEABLE_FROM.has(loan.status)) return null;

  const fromStatus = loan.status;
  let toStatus;
  let note = null;
  const updates = {};

  if (fromStatus === 'submitted') {
    toStatus = 'under_review';
    note = 'Underwriting review started';
  } else if (fromStatus === 'docs_submitted') {
    toStatus = 'under_review';
    note = 'Resubmitted documents back under review';
  } else {
    // under_review: resolve to a documentation request or a final decision
    const roll = Math.random();
    if (roll < 0.3) {
      toStatus = 'docs_requested';
      note = 'Additional documentation requested (proof of income)';
    } else {
      const approved = Math.random() < 0.75;
      toStatus = approved ? 'approved' : 'denied';
      updates.decided_at = new Date().toISOString();
      if (approved) {
        updates.apr = assignApr(loan);
        note = `Approved at ${updates.apr}% APR`;
      } else {
        note = 'Denied: debt-to-income ratio exceeds program limit';
      }
    }
  }

  updates.status = toStatus;
  updates.decision_note = note;
  await updateDraft(loan.id, updates);
  await logEvent(loan.id, fromStatus, toStatus, actor, note);

  return { fromStatus, toStatus, note };
}

async function respondToDocs(loan, actor) {
  if (loan.status !== 'docs_requested') return null;
  await updateDraft(loan.id, { status: 'docs_submitted' });
  await logEvent(loan.id, 'docs_requested', 'docs_submitted', actor, 'Applicant submitted requested documents');
  return { fromStatus: 'docs_requested', toStatus: 'docs_submitted' };
}

module.exports = {
  getById,
  listForUser,
  listAll,
  listEvents,
  createDraft,
  updateDraft,
  submit,
  advance,
  respondToDocs,
};
