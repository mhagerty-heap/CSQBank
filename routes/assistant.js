const express = require('express');
const router = express.Router();
const scenarios = require('../lib/assistantScenarios');
const { DRIVERS } = require('../lib/contactDrivers');

// Admin UI. Open (no login) by design: scenarios are authored and stored in
// the presenter's browser (localStorage); nothing here writes server-side.
router.get('/admin/assistant', (req, res) => {
  res.render('admin/assistant', { title: 'Assistant Scenarios' });
});

// Baseline scenarios + driver taxonomy, for the admin UI.
router.get('/assistant/scenarios.json', (req, res) => {
  res.json({ defaultSlug: scenarios.defaultSlug, scenarios: scenarios.all(), drivers: DRIVERS });
});

// Single baseline scenario, for the widget. Local (localStorage) scenarios
// are resolved client-side before this is called.
router.get('/assistant/scenario/:slug', (req, res) => {
  const s = scenarios.get(req.params.slug);
  if (!s) return res.status(404).json({ success: false });
  res.json({ success: true, scenario: s });
});

module.exports = router;
