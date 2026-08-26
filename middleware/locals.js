module.exports = function injectLocals(req, res, next) {
  // ContentSquare/Heap tag ID — sourced from CSQ_TAG_ID env var, omitted if not set
  res.locals.csqTagId = process.env.CSQ_TAG_ID || null;

  // One-shot event to fire client-side via _uxa on the next page render only
  // (e.g. a loan status transition). Consumed here so it never double-fires
  // on a refresh.
  res.locals.pendingTrackEvent = req.session.pendingTrackEvent || null;
  delete req.session.pendingTrackEvent;

  res.locals.flash = {
    success: req.flash ? req.flash('success') : [],
    error: req.flash ? req.flash('error') : [],
    info: req.flash ? req.flash('info') : []
  };

  next();
};
