const express = require('express');
const router = express.Router();

// Demo-only error injection for the Selenium frustration persona
// (scripts/seleniumScripts/csBankJourneyZoningFunnel_CSQXP.py). The real
// /transfer route always succeeds once the form is valid, so there's no
// genuine failure path to demo an outage against. This endpoint exists
// purely so that script can fire a real XHR that fails with a realistic
// body, giving CSQ Error Analysis something to capture.
router.post('/transfer-verify', (req, res) => {
  res.status(503).json({
    code: 'TRANSFER_SERVICE_UNAVAILABLE',
    message: 'The transfer service is temporarily unavailable. Please try again in a few minutes.',
  });
});

module.exports = router;
