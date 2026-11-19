// Scripted "AI assistant" chat widget — fully canned, no LLM calls.
// Ported from ecommerce-main's agent-widget.js, adapted for CSQBank:
//   - floating bubble launcher (#assistant-bubble, rendered in footer.ejs)
//   - scenarios resolve from localStorage first (authored in /admin/assistant),
//     then from the server baseline (/assistant/scenario/:slug)
//   - every scenario carries a contact driver (L1/L2/L3), reported to
//     Contentsquare/Heap via _uxa trackEvent properties (Title Case names,
//     matching ecommerce-main's convention)
//
// Scenario slug resolution order:
//   1. ?aiScenario=<slug> (persisted in sessionStorage for the tab)
//   2. sessionStorage aiScenarioSlug
//   3. default chosen in the admin (localStorage csqAssistant:default)
//   4. server default (data-default-scenario on the bubble)
// The reserved slug "assistant-off" hides the bubble for the tab.
(function () {
  var LOCAL_SCENARIOS_KEY = 'csqAssistant:scenarios';
  var LOCAL_DEFAULT_KEY = 'csqAssistant:default';
  var CONVO_PREFIX = 'aiScenarioConvo:';
  var OFF_SLUG = 'assistant-off';

  var bubble = document.getElementById('assistant-bubble');
  if (!bubble) return;

  function lsGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }

  var params = new URLSearchParams(window.location.search);
  var qsSlug = params.get('aiScenario');
  if (qsSlug) { try { sessionStorage.setItem('aiScenarioSlug', qsSlug); } catch (e) {} }

  var slug = qsSlug;
  if (!slug) { try { slug = sessionStorage.getItem('aiScenarioSlug'); } catch (e) {} }
  if (!slug) slug = lsGet(LOCAL_DEFAULT_KEY);
  if (!slug) slug = bubble.getAttribute('data-default-scenario');
  if (!slug || slug === OFF_SLUG) return;

  function localScenario(s) {
    try {
      var all = JSON.parse(lsGet(LOCAL_SCENARIOS_KEY) || '{}');
      return all && all[s] ? all[s] : null;
    } catch (e) { return null; }
  }

  var local = localScenario(slug);
  if (local) {
    init(local);
  } else {
    fetch('/assistant/scenario/' + encodeURIComponent(slug))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) { if (data && data.success) init(data.scenario); })
      .catch(function () {});
  }

  // ---- Contentsquare instrumentation -------------------------------------
  function csqEvent(name, props) {
    window._uxa = window._uxa || [];
    window._uxa.push(['trackEvent', { name: name, properties: props }]);
  }

  function init(scenario) {
    bubble.style.display = '';

    var driver = scenario.driver || {};
    var convoKey = CONVO_PREFIX + scenario.slug;
    var panel, body, textFooter, chipsFooter, input;
    var stepIndex = 0, ended = false, transcript = [], reasonSent = false;

    function baseProps(extra) {
      var p = {
        'Scenario': scenario.slug,
        'Contact Reason L1': driver.l1 || '',
        'Contact Reason L2': driver.l2 || '',
        'Contact Reason L3': driver.l3 || ''
      };
      for (var k in extra) p[k] = extra[k];
      return p;
    }

    // Fires once per conversation, on the first user message or chip click.
    function reportReason(source) {
      if (reasonSent || !driver.l3) return;
      reasonSent = true;
      csqEvent('Assistant Contact Reason', baseProps({ 'Source': source }));
    }

    function saveState() {
      try {
        sessionStorage.setItem(convoKey, JSON.stringify({
          stepIndex: stepIndex, ended: ended, reasonSent: reasonSent,
          panelOpen: !!(panel && panel.style.display !== 'none'),
          transcript: transcript
        }));
      } catch (e) {}
    }

    function loadState() {
      try {
        var saved = JSON.parse(sessionStorage.getItem(convoKey) || 'null');
        if (!saved || !Array.isArray(saved.transcript)) return null;
        if (!saved.ended && !(typeof saved.stepIndex === 'number' && saved.stepIndex >= 0 && saved.stepIndex <= scenario.steps.length)) return null;
        return saved;
      } catch (e) { return null; }
    }

    function togglePanel(open) {
      if (!panel) {
        buildPanel();
        restoreOrGreet();
        csqEvent('Assistant Opened', baseProps({}));
        return;
      }
      var show = (typeof open === 'boolean') ? open : panel.style.display === 'none';
      panel.style.display = show ? 'flex' : 'none';
      if (show) csqEvent('Assistant Opened', baseProps({}));
      saveState();
    }

    bubble.addEventListener('click', function () { togglePanel(); });

    // Restore an open panel after a page navigation.
    var prior = loadState();
    if (prior && prior.panelOpen) {
      buildPanel();
      restoreOrGreet();
    }

    function buildPanel() {
      panel = document.createElement('div');
      panel.id = 'assistant-panel';
      panel.className = 'assistant-panel';
      panel.innerHTML =
        '<div class="assistant-topbar">' +
          '<span><i class="bi bi-stars"></i> ' + escapeHtml(scenario.name || 'CSQBank Assistant') + '</span>' +
          '<button type="button" class="assistant-close" id="assistant-close-btn" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="assistant-body" id="assistant-body"></div>' +
        '<div class="assistant-chips-footer" id="assistant-chips-footer" style="display:none;"></div>' +
        '<div class="assistant-text-footer" id="assistant-text-footer">' +
          '<input type="text" class="assistant-input" id="assistant-input" placeholder="Type a message...">' +
          '<button type="button" class="assistant-send" id="assistant-send-btn">Send</button>' +
        '</div>';
      document.body.appendChild(panel);

      body = panel.querySelector('#assistant-body');
      textFooter = panel.querySelector('#assistant-text-footer');
      chipsFooter = panel.querySelector('#assistant-chips-footer');
      input = panel.querySelector('#assistant-input');

      panel.querySelector('#assistant-close-btn').addEventListener('click', function () {
        panel.style.display = 'none';
        saveState();
      });
      panel.querySelector('#assistant-send-btn').addEventListener('click', handleSend);
      input.addEventListener('keypress', function (e) { if (e.key === 'Enter') handleSend(); });
    }

    function escapeHtml(s) {
      return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Builds bubble content with textContent/DOM only (no innerHTML). Supports
    // [label](/internal/path) links.
    function fillBubble(el, text) {
      var re = /\[([^\]]+)\]\((\/[^)\s]*)\)/g;
      var last = 0, m;
      text = String(text == null ? '' : text);
      while ((m = re.exec(text))) {
        if (m.index > last) el.appendChild(document.createTextNode(text.slice(last, m.index)));
        var a = document.createElement('a');
        a.href = m[2];
        a.setAttribute('data-href', m[2]);
        a.id = 'assistant-link-' + (body.querySelectorAll('.assistant-link').length + el.querySelectorAll('.assistant-link').length);
        a.textContent = m[1];
        a.className = 'assistant-link';
        a.addEventListener('click', function () { saveState(); });
        el.appendChild(a);
        last = re.lastIndex;
      }
      if (last < text.length) el.appendChild(document.createTextNode(text.slice(last)));
    }

    function renderBubbleDom(text, who) {
      var el = document.createElement('div');
      el.className = 'assistant-bubble-msg assistant-bubble-' + who;
      el.id = 'assistant-msg-' + body.querySelectorAll('.assistant-bubble-msg').length;
      el.setAttribute('data-who', who);
      fillBubble(el, text);
      body.appendChild(el);
      body.scrollTop = body.scrollHeight;
    }

    function appendBubble(text, who) {
      transcript.push({ who: who, text: text });
      renderBubbleDom(text, who);
    }

    function restoreOrGreet() {
      var saved = loadState();
      if (saved) {
        transcript = saved.transcript.slice();
        transcript.forEach(function (item) { renderBubbleDom(item.text, item.who); });
        stepIndex = (typeof saved.stepIndex === 'number') ? saved.stepIndex : 0;
        ended = !!saved.ended;
        reasonSent = !!saved.reasonSent;
      } else if (scenario.greeting) {
        appendBubble(scenario.greeting, 'agent');
      }
      renderStep();
      setState(ended ? 'ended' : 'idle');
      saveState();
    }

    // data-state on the panel: idle | typing | ended — for scripts to wait on.
    function setState(st) { if (panel) panel.setAttribute('data-state', st); }

    function currentStep() { return scenario.steps[stepIndex]; }

    function showText() {
      chipsFooter.style.display = 'none';
      textFooter.style.display = 'flex';
      input.disabled = false;
    }

    function renderStep() {
      var step = currentStep();
      if (ended || !step) { ended = true; showText(); return; }
      if (step.mode === 'chips' && step.chips && step.chips.length) {
        textFooter.style.display = 'none';
        chipsFooter.style.display = 'flex';
        chipsFooter.innerHTML = '';
        step.chips.forEach(function (chip, i) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'assistant-chip';
          btn.id = 'assistant-chip-' + i;
          btn.setAttribute('data-label', chip.label);
          btn.textContent = chip.label;
          btn.addEventListener('click', function () { handleChip(chip); });
          chipsFooter.appendChild(btn);
        });
      } else {
        showText();
      }
    }

    function showTypingThen(delayMs, fn) {
      var typing = document.createElement('div');
      typing.className = 'assistant-typing';
      typing.id = 'assistant-typing';
      setState('typing');
      typing.innerHTML = '<span></span><span></span><span></span>';
      body.appendChild(typing);
      body.scrollTop = body.scrollHeight;
      setTimeout(function () { typing.remove(); fn(); setState(ended ? 'ended' : 'idle'); }, delayMs || 1200);
    }

    function handleSend() {
      var text = input.value.trim();
      if (!text) return;
      appendBubble(text, 'user');
      input.value = '';
      input.disabled = true;
      reportReason('typed');

      if (ended) {
        showTypingThen(1000, function () {
          appendBubble(scenario.completionText || '', 'agent');
          input.disabled = false;
          input.focus();
          saveState();
        });
        return;
      }
      var step = currentStep();
      showTypingThen(step.typingDelayMs, function () {
        appendBubble(step.response, 'agent');
        stepIndex += 1;
        renderStep();
        saveState();
      });
    }

    function handleChip(chip) {
      appendBubble(chip.label, 'user');
      reportReason('chip');
      csqEvent('Assistant Chip Clicked', baseProps({ 'Chip Label': chip.label }));
      chipsFooter.style.display = 'none';
      var step = currentStep();
      showTypingThen(step.typingDelayMs, function () {
        appendBubble(chip.response, 'agent');
        if (chip.next == null || chip.next === '') ended = true;
        else stepIndex = Number(chip.next);
        renderStep();
        saveState();
      });
    }
  }
})();
