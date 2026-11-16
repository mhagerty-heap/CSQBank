// Assistant scenarios served to the widget. Baseline = hand-written scenarios
// in data/scenarios.json + one generated stub per contact driver that has no
// hand-written scenario. Admin-authored scenarios live in the browser
// (localStorage) and are merged over this baseline client-side; promoting one
// means exporting its JSON and adding it to data/scenarios.json.
const curated = require('../data/scenarios.json');
const { DRIVERS } = require('./contactDrivers');

const OFF_SLUG = 'assistant-off';

function stubFor(d) {
  return {
    version: 1,
    slug: d.slug,
    name: 'CSQBank Assistant',
    generated: true,
    driver: { l1: d.l1, l2: d.l2, l3: d.l3 },
    greeting: "Hi, I'm the CSQBank Assistant. How can I help you today?",
    completionText: 'Thanks for your message. For anything else, you can [schedule a meeting](/schedule-a-meeting) with a representative.',
    steps: [
      {
        mode: 'free_text',
        response: `Thanks for reaching out. It sounds like you need help with "${d.l3}" (${d.l2}). Is that right?`,
        typingDelayMs: 1200,
        chips: [],
      },
      {
        mode: 'chips',
        response: '',
        typingDelayMs: 1200,
        chips: [
          { label: "Yes, that's right", response: "Thanks for confirming. I've noted this for our team. Would you like a specialist to follow up with you?", next: 2 },
          { label: 'No, something else', response: 'No problem. Please tell me more in the box below, or [contact us](/contact).', next: null },
        ],
      },
      {
        mode: 'chips',
        response: '',
        typingDelayMs: 1000,
        chips: [
          { label: 'Yes, schedule a meeting', response: 'Great. You can [book a time with a specialist](/schedule-a-meeting).', next: null },
          { label: 'No thanks', response: 'Understood. If you need anything else, just type below.', next: null },
        ],
      },
    ],
  };
}

function all() {
  const bySlug = new Map();
  curated.scenarios.forEach(s => bySlug.set(s.slug, s));
  DRIVERS.forEach(d => { if (!bySlug.has(d.slug)) bySlug.set(d.slug, stubFor(d)); });
  return Array.from(bySlug.values());
}

function get(slug) {
  return all().find(s => s.slug === slug) || null;
}

module.exports = { all, get, defaultSlug: curated.defaultSlug, OFF_SLUG };
