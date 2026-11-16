// Admin UI for assistant scenarios. Everything authored here lives in
// localStorage (this browser only); baseline scenarios come read-only from
// /assistant/scenarios.json. Export produces JSON to be committed into
// data/scenarios.json.
(function () {
  var SCEN_KEY = 'csqAssistant:scenarios';
  var DEF_KEY = 'csqAssistant:default';
  var OFF_SLUG = 'assistant-off';

  var root = document.getElementById('aa-root');
  var msgEl = document.getElementById('aa-message');
  var fileInput = document.getElementById('aa-file');

  var baseline = { scenarios: [], drivers: [], defaultSlug: '' };
  var curatedSlugs = {};
  var draft = null;        // scenario being edited
  var draftIsNew = true;
  var showStubs = false;
  var filter = '';

  // ---- storage -----------------------------------------------------------
  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(SCEN_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveLocal(obj) {
    try { localStorage.setItem(SCEN_KEY, JSON.stringify(obj)); return true; }
    catch (e) { flash('Could not save to localStorage: ' + e.message, 'danger'); return false; }
  }
  function getDefault() { try { return localStorage.getItem(DEF_KEY) || ''; } catch (e) { return ''; } }
  function setDefault(slug) {
    try { if (slug) localStorage.setItem(DEF_KEY, slug); else localStorage.removeItem(DEF_KEY); } catch (e) {}
  }

  // ---- helpers -----------------------------------------------------------
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function flash(text, kind) {
    msgEl.innerHTML = '<div class="alert alert-' + (kind || 'success') + ' py-2">' + esc(text) + '</div>';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function emptyScenario() {
    return {
      version: 1, slug: '', name: 'CSQBank Assistant', driver: { l1: '', l2: '', l3: '' },
      greeting: "Hi, I'm the CSQBank Assistant. How can I help you today?",
      completionText: 'Thanks for your message. For anything else, you can [schedule a meeting](/schedule-a-meeting) with a representative.',
      steps: [{ mode: 'free_text', response: '', typingDelayMs: 1200, chips: [] }]
    };
  }
  function download(filename, data) {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }
  function setPath(obj, path, value) {
    var parts = path.split('.');
    for (var i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
    obj[parts[parts.length - 1]] = value;
  }
  function cleanForExport(s) {
    var c = clone(s);
    delete c.generated;
    c.version = 1;
    return c;
  }

  // ---- list view ---------------------------------------------------------
  function sourceOf(slug, local) {
    var isBase = baseline.scenarios.some(function (s) { return s.slug === slug; });
    var inLocal = !!local[slug];
    if (inLocal && isBase) return 'override';
    if (inLocal) return 'local';
    return curatedSlugs[slug] ? 'baseline' : 'stub';
  }

  function renderList() {
    var local = loadLocal();
    var bySlug = {};
    baseline.scenarios.forEach(function (s) { bySlug[s.slug] = s; });
    Object.keys(local).forEach(function (k) { bySlug[k] = local[k]; });
    var rows = Object.keys(bySlug).map(function (k) { return bySlug[k]; });

    var effDefault = getDefault() || baseline.defaultSlug;
    var q = filter.toLowerCase();
    rows = rows.filter(function (s) {
      var src = sourceOf(s.slug, local);
      if (src === 'stub' && !showStubs && !q) return false;
      if (!q) return true;
      var d = s.driver || {};
      return (s.slug + ' ' + d.l1 + ' ' + d.l2 + ' ' + d.l3).toLowerCase().indexOf(q) !== -1;
    });
    var order = { override: 0, local: 0, baseline: 1, stub: 2 };
    rows.sort(function (a, b) {
      var oa = order[sourceOf(a.slug, local)], ob = order[sourceOf(b.slug, local)];
      return oa - ob || a.slug.localeCompare(b.slug);
    });

    var badge = {
      local: '<span class="badge bg-success">Local</span>',
      override: '<span class="badge bg-warning text-dark">Local · overrides baseline</span>',
      baseline: '<span class="badge bg-primary">Baseline</span>',
      stub: '<span class="badge bg-secondary">Generated stub</span>'
    };

    var html = '' +
      '<div class="d-flex flex-wrap gap-3 align-items-center mb-2">' +
        '<input type="search" id="aa-filter" class="form-control form-control-sm" style="max-width:280px" placeholder="Filter by slug or driver…" value="' + esc(filter) + '">' +
        '<div class="form-check"><input class="form-check-input" type="checkbox" id="aa-show-stubs"' + (showStubs ? ' checked' : '') + '>' +
        '<label class="form-check-label small" for="aa-show-stubs">Show generated stubs (' + baseline.scenarios.filter(function (s) { return !curatedSlugs[s.slug]; }).length + ')</label></div>' +
        '<div class="small text-muted ms-auto">Default: <code>' + esc(effDefault) + '</code>' +
          (getDefault() ? ' (local) <a href="#" id="aa-clear-default" data-action="clear-default">reset</a>' : '') + '</div>' +
      '</div>' +
      '<div class="table-responsive"><table class="table table-sm align-middle bg-white border">' +
      '<thead><tr><th>Slug</th><th>Contact driver</th><th>Source</th><th class="text-end">Actions</th></tr></thead><tbody>';

    rows.forEach(function (s) {
      var src = sourceOf(s.slug, local);
      var d = s.driver || {};
      var isLocal = src === 'local' || src === 'override';
      var sl = esc(s.slug);
      html += '<tr id="aa-row-' + sl + '">' +
        '<td><code>' + esc(s.slug) + '</code>' + (s.slug === effDefault ? ' <span class="badge bg-info text-dark">default</span>' : '') + '</td>' +
        '<td class="small">' + esc(d.l1) + ' › ' + esc(d.l2) + ' › <strong>' + esc(d.l3) + '</strong></td>' +
        '<td>' + badge[src] + '</td>' +
        '<td class="text-end text-nowrap">' +
          '<a class="btn btn-sm btn-outline-success" id="aa-test-' + sl + '" target="_blank" rel="noopener" href="/?aiScenario=' + encodeURIComponent(s.slug) + '">Test</a> ' +
          '<button class="btn btn-sm btn-outline-primary" id="aa-edit-' + sl + '" data-action="edit" data-slug="' + esc(s.slug) + '">Edit</button> ' +
          '<button class="btn btn-sm btn-outline-secondary" id="aa-duplicate-' + sl + '" data-action="duplicate" data-slug="' + esc(s.slug) + '">Duplicate</button> ' +
          '<button class="btn btn-sm btn-outline-secondary" id="aa-default-' + sl + '" data-action="default" data-slug="' + esc(s.slug) + '">Set default</button> ' +
          '<button class="btn btn-sm btn-outline-secondary" id="aa-export-' + sl + '" data-action="export" data-slug="' + esc(s.slug) + '">Export</button>' +
          (isLocal ? ' <button class="btn btn-sm btn-outline-danger" id="aa-delete-' + sl + '" data-action="delete" data-slug="' + esc(s.slug) + '">Delete local</button>' : '') +
        '</td></tr>';
    });
    if (!rows.length) html += '<tr><td colspan="4" class="text-muted text-center py-3">No scenarios match.</td></tr>';
    html += '</tbody></table></div>';
    html += '<p class="small text-muted">Every contact driver has a working slug (<code>?aiScenario=&lt;slug&gt;</code>) — unwritten ones play a generated stub. Use Edit on a stub to write a real script.</p>';
    root.innerHTML = html;
  }

  // ---- editor ------------------------------------------------------------
  function optionList(items, selected, blank) {
    var h = blank ? '<option value="">' + esc(blank) + '</option>' : '';
    items.forEach(function (i) { h += '<option value="' + esc(i) + '"' + (i === selected ? ' selected' : '') + '>' + esc(i) + '</option>'; });
    return h;
  }
  function uniq(arr) { return arr.filter(function (v, i) { return arr.indexOf(v) === i; }); }

  function nextOptions(selected, stepCount) {
    var h = '<option value=""' + (selected == null ? ' selected' : '') + '>End conversation</option>';
    for (var i = 0; i < stepCount; i++) {
      h += '<option value="' + i + '"' + (selected === i ? ' selected' : '') + '>Go to step ' + (i + 1) + '</option>';
    }
    return h;
  }

  function renderEditor() {
    var d = draft.driver;
    var l1s = uniq(baseline.drivers.map(function (x) { return x.l1; }));
    var l2s = uniq(baseline.drivers.filter(function (x) { return x.l1 === d.l1; }).map(function (x) { return x.l2; }));
    var l3s = baseline.drivers.filter(function (x) { return x.l1 === d.l1 && x.l2 === d.l2; }).map(function (x) { return x.l3; });
    var def = baseline.drivers.filter(function (x) { return x.l3 === d.l3 && x.l2 === d.l2 && x.l1 === d.l1; })[0];

    var h = '<div class="card"><div class="card-body">' +
      '<h5 class="card-title">' + (draftIsNew ? 'New scenario' : 'Edit scenario') + '</h5>' +
      '<div class="row g-3">' +
        '<div class="col-md-4"><label class="form-label">Slug</label><input class="form-control" id="aa-slug" data-bind="slug" value="' + esc(draft.slug) + '" placeholder="e.g. card-lock-help"><div class="form-text">Used in <code>?aiScenario=</code>. Lowercase letters, numbers, dashes.</div></div>' +
        '<div class="col-md-4"><label class="form-label">Panel title</label><input class="form-control" id="aa-name" data-bind="name" value="' + esc(draft.name) + '"></div>' +
      '</div>' +
      '<div class="row g-3 mt-1">' +
        '<div class="col-md-4"><label class="form-label">Contact driver · L1</label><select class="form-select" id="aa-l1" data-driver="l1">' + optionList(l1s, d.l1, '— select —') + '</select></div>' +
        '<div class="col-md-4"><label class="form-label">L2</label><select class="form-select" id="aa-l2" data-driver="l2">' + optionList(l2s, d.l2, '— select —') + '</select></div>' +
        '<div class="col-md-4"><label class="form-label">L3</label><select class="form-select" id="aa-l3" data-driver="l3">' + optionList(l3s, d.l3, '— select —') + '</select></div>' +
      '</div>' +
      (def ? '<div class="form-text mb-2">' + esc(def.definition) + '</div>' : '') +
      '<div class="mt-3"><label class="form-label">Greeting (first assistant message)</label><textarea class="form-control" rows="2" id="aa-greeting" data-bind="greeting">' + esc(draft.greeting) + '</textarea></div>' +
      '<div class="mt-3"><label class="form-label">Completion text (reply to anything typed after the script ends)</label><textarea class="form-control" rows="2" id="aa-completion" data-bind="completionText">' + esc(draft.completionText) + '</textarea></div>' +
      '<div class="form-text">Tip: link with <code>[label](/path)</code>, e.g. <code>[schedule a meeting](/schedule-a-meeting)</code>.</div>' +
      '<hr><h6>Steps</h6>';

    var n = draft.steps.length;
    draft.steps.forEach(function (st, i) {
      h += '<div class="border rounded p-3 mb-3 bg-light" id="aa-step-' + i + '">' +
        '<div class="d-flex justify-content-between align-items-center mb-2"><strong>Step ' + (i + 1) + '</strong>' +
        '<button class="btn btn-sm btn-outline-danger" id="aa-step-' + i + '-remove" data-action="remove-step" data-i="' + i + '"' + (n === 1 ? ' disabled' : '') + '>Remove step</button></div>' +
        '<div class="row g-2">' +
          '<div class="col-md-4"><label class="form-label small">Mode</label><select class="form-select form-select-sm" id="aa-step-' + i + '-mode" data-bind="steps.' + i + '.mode" data-rerender="1">' +
            '<option value="free_text"' + (st.mode === 'free_text' ? ' selected' : '') + '>Free text (user types anything)</option>' +
            '<option value="chips"' + (st.mode === 'chips' ? ' selected' : '') + '>Chips (user picks a button)</option></select></div>' +
          '<div class="col-md-3"><label class="form-label small">Typing delay (ms)</label><input type="number" min="0" step="100" class="form-control form-control-sm" id="aa-step-' + i + '-delay" data-bind="steps.' + i + '.typingDelayMs" data-number="1" value="' + esc(st.typingDelayMs) + '"></div>' +
        '</div>';
      if (st.mode === 'free_text') {
        h += '<div class="mt-2"><label class="form-label small">Assistant reply (whatever the user types, this is the answer)</label>' +
          '<textarea class="form-control form-control-sm" rows="2" id="aa-step-' + i + '-response" data-bind="steps.' + i + '.response">' + esc(st.response) + '</textarea></div>';
      } else {
        h += '<div class="mt-2"><label class="form-label small">Chips (the assistant\'s previous message should ask the question)</label>';
        (st.chips || []).forEach(function (c, j) {
          h += '<div class="border rounded p-2 mb-2 bg-white" id="aa-chip-' + i + '-' + j + '"><div class="row g-2">' +
            '<div class="col-md-4"><input class="form-control form-control-sm" placeholder="Chip label" id="aa-chip-' + i + '-' + j + '-label" data-bind="steps.' + i + '.chips.' + j + '.label" value="' + esc(c.label) + '"></div>' +
            '<div class="col-md-5"><textarea class="form-control form-control-sm" rows="2" placeholder="Assistant response" id="aa-chip-' + i + '-' + j + '-response" data-bind="steps.' + i + '.chips.' + j + '.response">' + esc(c.response) + '</textarea></div>' +
            '<div class="col-md-2"><select class="form-select form-select-sm" id="aa-chip-' + i + '-' + j + '-next" data-bind="steps.' + i + '.chips.' + j + '.next" data-next="1">' + nextOptions(c.next, n) + '</select></div>' +
            '<div class="col-md-1 text-end"><button class="btn btn-sm btn-outline-danger" id="aa-chip-' + i + '-' + j + '-remove" data-action="remove-chip" data-i="' + i + '" data-j="' + j + '">×</button></div>' +
          '</div></div>';
        });
        h += '<button class="btn btn-sm btn-outline-secondary" id="aa-step-' + i + '-add-chip" data-action="add-chip" data-i="' + i + '">+ Add chip</button></div>';
      }
      h += '</div>';
    });

    h += '<button class="btn btn-sm btn-outline-secondary" id="aa-add-step" data-action="add-step">+ Add step</button>' +
      '<hr><div class="d-flex gap-2"><button class="btn btn-primary" data-action="save" id="aa-save">Save locally</button>' +
      '<button class="btn btn-outline-secondary" data-action="cancel" id="aa-cancel">Cancel</button></div>' +
      '</div></div>';
    root.innerHTML = h;
  }

  function validate(s) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.slug)) return 'Slug must be lowercase letters, numbers and dashes.';
    if (s.slug === OFF_SLUG) return '"' + OFF_SLUG + '" is reserved.';
    if (!s.driver.l3) return 'Pick a contact driver (L1 › L2 › L3).';
    for (var i = 0; i < s.steps.length; i++) {
      var st = s.steps[i];
      if (st.mode === 'free_text' && !st.response.trim()) return 'Step ' + (i + 1) + ' needs an assistant reply.';
      if (st.mode === 'chips') {
        if (!st.chips.length) return 'Step ' + (i + 1) + ' is a chips step but has no chips.';
        for (var j = 0; j < st.chips.length; j++) {
          if (!st.chips[j].label.trim() || !st.chips[j].response.trim()) return 'Step ' + (i + 1) + ', chip ' + (j + 1) + ' needs a label and a response.';
        }
      }
    }
    return null;
  }

  function normalize(s) {
    // Make sure every step has the full shape (imports / older exports).
    s.version = 1;
    s.name = s.name || 'CSQBank Assistant';
    s.driver = s.driver || { l1: '', l2: '', l3: '' };
    s.greeting = s.greeting || '';
    s.completionText = s.completionText || '';
    s.steps = (s.steps || []).map(function (st) {
      return {
        mode: st.mode === 'chips' ? 'chips' : 'free_text',
        response: st.response || '',
        typingDelayMs: Number(st.typingDelayMs) || 1200,
        chips: (st.chips || []).map(function (c) {
          return { label: c.label || '', response: c.response || '', next: (c.next == null || c.next === '') ? null : Number(c.next) };
        })
      };
    });
    if (!s.steps.length) s.steps = emptyScenario().steps;
    return s;
  }

  function removeStep(i) {
    draft.steps.splice(i, 1);
    draft.steps.forEach(function (st) {
      (st.chips || []).forEach(function (c) {
        if (c.next === i) c.next = null;
        else if (c.next != null && c.next > i) c.next -= 1;
      });
    });
  }

  // ---- events ------------------------------------------------------------
  function openEditor(s, isNew) {
    draft = normalize(clone(s));
    delete draft.generated;
    draftIsNew = isNew;
    msgEl.innerHTML = '';
    renderEditor();
    window.scrollTo({ top: 0 });
  }

  function findScenario(slug) {
    var local = loadLocal();
    if (local[slug]) return local[slug];
    return baseline.scenarios.filter(function (s) { return s.slug === slug; })[0] || null;
  }

  function onAction(e) {
    var t = e.target.closest('[data-action]');
    if (!t) return;
    var action = t.getAttribute('data-action');
    var slug = t.getAttribute('data-slug');
    var i = Number(t.getAttribute('data-i'));
    var j = Number(t.getAttribute('data-j'));
    e.preventDefault();

    switch (action) {
      case 'new': openEditor(emptyScenario(), true); break;
      case 'import': fileInput.click(); break;
      case 'export-all':
        var local = loadLocal();
        var list = Object.keys(local).map(function (k) { return cleanForExport(local[k]); });
        if (!list.length) return flash('No local scenarios to export.', 'warning');
        download('csqbank-assistant-scenarios.json', list);
        break;
      case 'clear-local':
        if (confirm('Delete ALL locally authored scenarios in this browser? Export first if you need them.')) {
          saveLocal({});
          setDefault('');
          flash('Local scenarios cleared.');
          renderList();
        }
        break;
      case 'edit': {
        var s = findScenario(slug);
        if (s) openEditor(s, false);
        break;
      }
      case 'duplicate': {
        var src = findScenario(slug);
        if (!src) break;
        var c = clone(src);
        c.slug = slug + '-copy';
        delete c.generated;
        openEditor(c, true);
        break;
      }
      case 'default': setDefault(slug); flash('Default scenario in this browser is now "' + slug + '".'); renderList(); break;
      case 'clear-default': setDefault(''); renderList(); break;
      case 'export': {
        var ex = findScenario(slug);
        if (ex) download(slug + '.json', cleanForExport(ex));
        break;
      }
      case 'delete':
        if (confirm('Delete local scenario "' + slug + '"?')) {
          var l = loadLocal();
          delete l[slug];
          saveLocal(l);
          if (getDefault() === slug) setDefault('');
          flash('Deleted "' + slug + '".');
          renderList();
        }
        break;
      case 'add-step': draft.steps.push({ mode: 'free_text', response: '', typingDelayMs: 1200, chips: [] }); renderEditor(); break;
      case 'remove-step': removeStep(i); renderEditor(); break;
      case 'add-chip': draft.steps[i].chips.push({ label: '', response: '', next: null }); renderEditor(); break;
      case 'remove-chip': draft.steps[i].chips.splice(j, 1); renderEditor(); break;
      case 'cancel': draft = null; renderList(); break;
      case 'save': {
        var err = validate(draft);
        if (err) return flash(err, 'danger');
        var store = loadLocal();
        store[draft.slug] = cleanForExport(draft);
        if (saveLocal(store)) {
          flash('Saved "' + draft.slug + '" locally. Use Test to try it, or Export to send it for the master list.');
          draft = null;
          renderList();
        }
        break;
      }
    }
  }

  function onInput(e) {
    var el = e.target;
    if (el.id === 'aa-filter') { filter = el.value; var pos = el.selectionStart; renderList(); var f = document.getElementById('aa-filter'); f.focus(); f.setSelectionRange(pos, pos); return; }
    if (el.id === 'aa-show-stubs') { showStubs = el.checked; renderList(); return; }
    if (!draft) return;

    var drv = el.getAttribute('data-driver');
    if (drv) {
      draft.driver[drv] = el.value;
      if (drv === 'l1') { draft.driver.l2 = ''; draft.driver.l3 = ''; }
      if (drv === 'l2') draft.driver.l3 = '';
      renderEditor();
      return;
    }
    var path = el.getAttribute('data-bind');
    if (!path) return;
    var val = el.value;
    if (el.getAttribute('data-number')) val = Number(val) || 0;
    if (el.getAttribute('data-next')) val = val === '' ? null : Number(val);
    setPath(draft, path, val);
    if (el.getAttribute('data-rerender')) renderEditor();
  }

  fileInput.addEventListener('change', function () {
    var f = fileInput.files && fileInput.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        var list = Array.isArray(data) ? data : (data.scenarios || [data]);
        var store = loadLocal(), count = 0, skipped = [];
        list.forEach(function (s) {
          if (!s || !s.slug || !Array.isArray(s.steps)) { skipped.push('(unnamed)'); return; }
          if (s.slug === OFF_SLUG) { skipped.push(s.slug); return; }
          store[s.slug] = cleanForExport(normalize(s));
          count++;
        });
        saveLocal(store);
        flash('Imported ' + count + ' scenario(s).' + (skipped.length ? ' Skipped: ' + skipped.join(', ') : ''), skipped.length ? 'warning' : 'success');
        renderList();
      } catch (err) {
        flash('Could not read that file: ' + err.message, 'danger');
      }
      fileInput.value = '';
    };
    reader.readAsText(f);
  });

  document.addEventListener('click', onAction);
  root.addEventListener('input', onInput);
  root.addEventListener('change', onInput);

  fetch('/assistant/scenarios.json')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      baseline = data;
      // Hand-written baseline scenarios are the ones without the generated flag.
      data.scenarios.forEach(function (s) { if (!s.generated) curatedSlugs[s.slug] = true; });
      renderList();
    })
    .catch(function (err) { root.innerHTML = '<div class="alert alert-danger">Could not load scenarios: ' + esc(err.message) + '</div>'; });
})();
