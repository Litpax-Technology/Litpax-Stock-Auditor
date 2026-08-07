// ============================================================
// Stock Auditor — form logic
// ============================================================

const CACHE_KEY = 'lsa_config_v1';

const state = {
  locations: new Set(),   // selected locations (multi)
  discrepancy: 'No',
  photoBase64: '',
  photoName: ''
};

// ---------- helpers ----------
const $ = (s) => document.querySelector(s);
const val = (s) => ($(s) ? $(s).value.trim() : '');

function toast(msg, isErr) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  setTimeout(() => (t.className = 'toast'), 3200);
}

// JSONP GET (reads)
function jsonp(action, params, cb) {
  const name = 'cb_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const qs = new URLSearchParams(Object.assign({ action, callback: name }, params || {})).toString();
  const s = document.createElement('script');
  window[name] = (res) => { delete window[name]; s.remove(); cb(null, res); };
  s.onerror = () => { delete window[name]; s.remove(); cb(new Error('Network error')); };
  s.src = API_URL + '?' + qs;
  document.body.appendChild(s);
}

// ---------- config load (cache-first) ----------
function loadConfig() {
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) { try { render(JSON.parse(cached)); } catch (e) {} }

  jsonp('getConfig', {}, (err, res) => {
    if (err || !res || !res.ok) {
      if (!cached) toast('Config load failed. Check API_URL / internet.', true);
      return;
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(res.data));
    render(res.data);
  });
}

function render(cfg) {
  // Material datalist (dropdown + free-type)
  $('#materialList').innerHTML = (cfg.materials || [])
    .map(m => `<option value="${escapeHtml(m.name)}">`).join('');

  // Depth select
  fillSelect('#depth', cfg.depths, 'Select depth…');

  // Root cause + Action selects
  fillSelect('#rootCause', cfg.rootCauses, 'Select…');
  fillSelect('#action', cfg.actions, 'Select…');

  // Location chips
  renderChips(cfg.locations || []);
}

function fillSelect(sel, items, placeholder) {
  const el = $(sel);
  if (!el) return;
  const current = el.value;
  el.innerHTML = `<option value="">${placeholder}</option>` +
    (items || []).map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  if (current) el.value = current; // keep selection on background refresh
}

function renderChips(locations) {
  const box = $('#locationChips');
  box.innerHTML = locations.map(l =>
    `<span class="chip${state.locations.has(l) ? ' on' : ''}" data-loc="${escapeHtml(l)}">${escapeHtml(l)}</span>`
  ).join('');
  box.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const loc = chip.dataset.loc;
      if (state.locations.has(loc)) { state.locations.delete(loc); chip.classList.remove('on'); }
      else { state.locations.add(loc); chip.classList.add('on'); }
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- discrepancy toggle ----------
$('#discToggle').querySelectorAll('button').forEach(btn => {
  btn.addEventListener('click', () => {
    $('#discToggle').querySelectorAll('button').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    state.discrepancy = btn.dataset.val;
    $('#discBlock').classList.toggle('show', state.discrepancy === 'Yes');
  });
});

// ---------- photo -> base64 ----------
$('#photo').addEventListener('change', () => {
  const f = $('#photo').files[0];
  if (!f) { state.photoBase64 = ''; state.photoName = ''; return; }
  const reader = new FileReader();
  reader.onload = () => { state.photoBase64 = reader.result; state.photoName = f.name; };
  reader.readAsDataURL(f);
});

// ---------- submit ----------
$('#submitBtn').addEventListener('click', submit);

async function submit() {
  const material = val('#material');
  const depth = val('#depth');

  // validation
  if (!material) return toast('Please enter material name.', true);
  if (state.locations.size === 0) return toast('Please select at least one location.', true);
  if (!depth) return toast('Please select depth.', true);
  if (state.discrepancy === 'Yes' && !val('#qty')) return toast('Please enter discrepancy quantity.', true);

  const payload = {
    action: 'submitAudit',
    auditedBy: val('#auditedBy'),
    material: material,
    location: Array.from(state.locations),
    depth: depth,
    discrepancyFound: state.discrepancy,
    discrepancyQty: val('#qty'),
    rootCause: val('#rootCause'),
    actionRequired: val('#action'),
    photoBase64: state.photoBase64,
    photoName: state.photoName
  };

  const btn = $('#submitBtn');
  btn.disabled = true;
  btn.textContent = 'Submitting…';

  try {
    // POST as text/plain (default for string body) -> no CORS preflight
    const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });
    const data = await res.json();
    if (data.ok) {
      toast('Audit submitted ✓  (' + data.auditId + ')');
      resetForm();
    } else {
      toast('Error: ' + (data.error || 'submit failed'), true);
    }
  } catch (err) {
    toast('Submit failed: ' + err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit Audit';
  }
}

function resetForm() {
  $('#auditedBy').value = '';
  $('#material').value = '';
  $('#depth').value = '';
  $('#qty').value = '';
  $('#rootCause').value = '';
  $('#action').value = '';
  $('#photo').value = '';
  state.locations.clear();
  state.photoBase64 = '';
  state.photoName = '';
  state.discrepancy = 'No';
  document.querySelectorAll('#locationChips .chip').forEach(c => c.classList.remove('on'));
  $('#discToggle').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.val === 'No'));
  $('#discBlock').classList.remove('show');
}

// ---------- init ----------
loadConfig();
