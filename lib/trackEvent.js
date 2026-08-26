// Queues a CSQ/Heap trackEvent to fire on the next page render, via the
// one-shot session flag consumed in middleware/locals.js. Used for events
// tied to a server-side transition (e.g. a loan status change) that has to
// survive a redirect before the client-side _uxa.push can fire.
function queueTrackEvent(req, name, properties) {
  req.session.pendingTrackEvent = { name, properties: properties || {} };
}

module.exports = { queueTrackEvent };
