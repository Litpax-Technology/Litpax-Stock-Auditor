// ============================================================
// Owner Portal — logic
// ============================================================

let allAudits = [];

const $ = (s) => document.querySelector(s);

function toast(msg, isErr) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  setTimeout(() => (t.className = 'toast'), 3200);
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function jsonp(action, params, cb) {
  const name = 'cb_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const qs = new URLSearchParams(Object.assign({ action, callback: name }, params || {})).toString();
  const s = document.createElement('script');
  window[name] = (res) => { delete window[name]; s.remove(); cb(null, res); };
  s.onerror = () => { delete window[name]; s.remove(); cb(new Error('Network error')); };
  s.src = API_URL + '?' + qs;
  document.body.appendChild(s);
}

// ---------- load ----------
function load() {
  $('#listArea').innerHTML = '<div class="loading">Loading audits…</div>';
  jsonp('getAudits', {}, (err, res) => {
    if (err || !res || !res.ok) {
      $('#listArea').innerHTML = '<div class="empty">Failed to load. Check API_URL / internet.</div>';
      return;
    }
    allAudits = res.data || [];
    buildLocationFilter();
    applyFilters();
  });
}

function buildLocationFilter() {
  const set = new Set();
  allAudits.forEach(a => String(a.Location || '').split(',').forEach(l => {
    const t = l.trim(); if (t) set.add(t);
  }));
  const sel = $('#fLocation');
  const cur = sel.value;
  sel.innerHTML = '<option value="">All locations</option>' +
    Array.from(set).sort().map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
  sel.value = cur;
}

// ---------- filter + render ----------
function applyFilters() {
  const status = $('#fStatus').value;
  const loc = $('#fLocation').value;
  const q = $('#fSearch').value.trim().toLowerCase();

  let rows = allAudits.filter(a => {
    if (status && String(a.Status) !== status) return false;
    if (loc && String(a.Location || '').indexOf(loc) === -1) return false;
    if (q) {
      const hay = (a.Material + ' ' + a.RootCause + ' ' + a.ActionRequired + ' ' + a.AuditedBy).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });

  $('#count').textContent = rows.length + ' record' + (rows.length === 1 ? '' : 's');

  if (!rows.length) {
    $('#listArea').innerHTML = '<div class="empty">No records match.</div>';
    return;
  }

  $('#listArea').innerHTML = '<div class="audit-list">' + rows.map(renderAudit).join('') + '</div>';
  wireCloseButtons();
}

function renderAudit(a) {
  const st = String(a.Status || '').toLowerCase();
  const badgeClass = st === 'open' ? 'open' : st === 'closed' ? 'closed' : 'clear';
  const ts = a.Timestamp ? new Date(a.Timestamp).toLocaleString() : '';
  const photo = a.PhotoURL ? `<a class="photo-link" href="${escapeHtml(a.PhotoURL)}" target="_blank">📷 View photo</a>` : '';

  const discFields = String(a.DiscrepancyFound) === 'Yes' ? `
    <div><div class="k">Qty</div><div class="v">${escapeHtml(a.DiscrepancyQty)}</div></div>
    <div><div class="k">Root Cause</div><div class="v">${escapeHtml(a.RootCause) || '—'}</div></div>
    <div><div class="k">Action</div><div class="v">${escapeHtml(a.ActionRequired) || '—'}</div></div>
  ` : '';

  const closeUI = st === 'open' ? `
    <div class="audit-actions">
      <input type="text" class="remark-input" data-id="${escapeHtml(a.AuditID)}" placeholder="Closing remark (optional)" style="max-width:280px;" />
      <button class="btn btn-sm close-btn" data-id="${escapeHtml(a.AuditID)}" style="width:auto;">Mark Closed</button>
    </div>` : (a.OwnerRemark ? `<div class="audit-meta">Remark: ${escapeHtml(a.OwnerRemark)}</div>` : '');

  return `
    <div class="audit">
      <div class="audit-top">
        <div>
          <div class="audit-title">${escapeHtml(a.Material) || '(no material)'}</div>
          <div class="audit-meta">${escapeHtml(ts)}${a.AuditedBy ? ' · ' + escapeHtml(a.AuditedBy) : ''} · ${escapeHtml(a.AuditID)}</div>
        </div>
        <span class="badge ${badgeClass}">${escapeHtml(a.Status)}</span>
      </div>
      <div class="audit-grid">
        <div><div class="k">Location</div><div class="v">${escapeHtml(a.Location) || '—'}</div></div>
        <div><div class="k">Depth</div><div class="v">${escapeHtml(a.Depth) || '—'}</div></div>
        <div><div class="k">Discrepancy</div><div class="v">${escapeHtml(a.DiscrepancyFound)}</div></div>
        ${discFields}
      </div>
      ${photo}
      ${closeUI}
    </div>`;
}

function wireCloseButtons() {
  document.querySelectorAll('.close-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const remark = (document.querySelector(`.remark-input[data-id="${CSS.escape(id)}"]`) || {}).value || '';
      btn.disabled = true;
      btn.textContent = 'Closing…';
      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          body: JSON.stringify({ action: 'updateStatus', auditId: id, status: 'Closed', ownerRemark: remark })
        });
        const data = await res.json();
        if (data.ok) {
          const a = allAudits.find(x => String(x.AuditID) === String(id));
          if (a) { a.Status = 'Closed'; a.ClosedOn = new Date().toISOString(); a.OwnerRemark = remark; }
          toast('Marked closed ✓');
          applyFilters();
        } else {
          toast('Error: ' + (data.error || 'failed'), true);
          btn.disabled = false; btn.textContent = 'Mark Closed';
        }
      } catch (err) {
        toast('Failed: ' + err.message, true);
        btn.disabled = false; btn.textContent = 'Mark Closed';
      }
    });
  });
}

// ---------- events ----------
$('#fStatus').addEventListener('change', applyFilters);
$('#fLocation').addEventListener('change', applyFilters);
$('#fSearch').addEventListener('input', applyFilters);
$('#refreshBtn').addEventListener('click', load);

// ---------- init ----------
load();
