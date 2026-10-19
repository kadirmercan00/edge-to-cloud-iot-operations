/* ============================================================
   EDGE-OPS AI — staff.js
   ============================================================ */
'use strict';

Auth.guardPage();
Auth.applyRoleUI();

/* ── Kullanıcı avatar ────────────────────────────────────── */
(function () {
  const user = Auth.getCurrentUser();
  const av = document.getElementById('userAvatar');
  if (user && av) {
    av.textContent = (user.name || '').slice(0, 2).toUpperCase();
    av.title = user.name + ' — ' + (user.role || '');
  }
  // Supervisor değilse topbar "Yeni Personel" butonunu gizle
  const isSupervisor = user && (CONFIG.SUPERVISOR_ROLES || []).includes(user.role);
  if (!isSupervisor) {
    const newBtn = document.querySelector('.topbar-right a[href="add-staff.html"]');
    if (newBtn) newBtn.style.display = 'none';
  }
})();

/* ── Saat ────────────────────────────────────────────────── */
function updateClock() {
  const el = document.getElementById('clock');
  if (el) el.textContent = new Date().toLocaleTimeString('tr-TR');
}
updateClock();
setInterval(updateClock, 1000);

/* ── Logout ──────────────────────────────────────────────── */
document.getElementById('logoutBtn').addEventListener('click', (e) => {
  e.preventDefault();
  Auth.logout();
});

/* ── Durum etiketleri ────────────────────────────────────── */
const STATE_LABEL = {
  IDLE:        'Boşta',
  IN_PROGRESS: 'Görevde',
  EN_ROUTE:    'Yolda',
  ARRIVING:    'Konuma Gidiyor',
  NEW_TASK:    'Yeni Görev',
  TASK_POOL:   'Görev Bekliyor',
  SUCCESS:     'Tamamladı',
  BOOT:        'Başlatılıyor',
};

const STATE_BADGE = {
  IDLE:        'badge-green',
  IN_PROGRESS: 'badge-blue',
  EN_ROUTE:    'badge-amber',
  ARRIVING:    'badge-amber',
  NEW_TASK:    'badge-blue',
  TASK_POOL:   'badge-amber',
  SUCCESS:     'badge-green',
  BOOT:        'badge-gray',
};

/* ── Avatar renkleri (card ID'ye göre deterministik) ─────── */
const AVATAR_COLORS = ['#6366F1', '#3B82F6', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
function avatarColor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

/* ── Pil rengi ───────────────────────────────────────────── */
function batteryColor(pct) {
  if (pct == null) return 'var(--text-muted)';
  if (pct >= 50) return 'var(--accent-green)';
  if (pct >= 20) return 'var(--accent-amber)';
  return 'var(--accent-red)';
}

/* ── State ───────────────────────────────────────────────── */
let allStaff     = [];
let allAssets = [];
let elevMap      = {};  // { asset_id: label }
let activeFilter = 'all';
let searchQuery  = '';

function isCardStaff(s) {
  return (s.client_type || 'card') !== 'mobile';
}

function visibleStaffList(staff) {
  const cardStaff = staff.filter(isCardStaff);
  return (cardStaff.length ? cardStaff : staff).slice(0, 1);
}

/* ── Kart render ─────────────────────────────────────────── */
function renderCard(s) {
  const badgeCls  = STATE_BADGE[s.state]  || 'badge-gray';
  const stateLabel= STATE_LABEL[s.state]  || s.state;
  const initials  = (s.display_name || s.id).split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const color     = avatarColor(s.id);
  const battery   = s.battery != null ? s.battery : null;
  const bColor    = batteryColor(battery);

  return `
    <div class="device-card" data-id="${sanitize(s.id)}">
      <div class="device-card-header">
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="avatar" style="background:${color};flex-shrink:0;">${sanitize(initials)}</div>
          <div>
            <div class="device-card-id">${sanitize(s.display_name || s.id)}</div>
            <div class="device-card-name">${sanitize(s.role || '—')}</div>
          </div>
        </div>
        <span class="badge ${badgeCls}">${sanitize(stateLabel)}</span>
      </div>

      <div class="device-card-meta">
        <div class="device-card-row">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="2" y="7" width="16" height="10" rx="2"/><path d="M22 11v2"/></svg>
          Kart: <span class="mono" style="font-size:.72rem">${sanitize(s.id)}</span>
        </div>
        ${s.active_elev_name ? `
        <div class="device-card-row">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="6" x2="12" y2="10"/></svg>
          ${sanitize(s.active_elev_name)}
        </div>` : ''}
        <div class="device-card-row">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
          Son: ${sanitize(s.last_seen_str || '—')}
        </div>
      </div>

      ${battery != null ? `
      <div style="padding:0 16px 14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
          <span style="font-size:.72rem;color:var(--text-muted);">Batarya</span>
          <span style="font-size:.78rem;font-weight:600;color:${bColor};">${sanitize(battery)}%</span>
        </div>
        <div class="battery-track">
          <div class="battery-fill" style="width:${battery}%;background:${bColor};"></div>
        </div>
      </div>` : ''}

      <div class="device-card-stats">
        <div class="device-stat">
          <span class="device-stat-label">Toplam Görev</span>
          <span class="device-stat-value">${s.total_tasks != null ? sanitize(s.total_tasks) : '—'}</span>
        </div>
        <div class="device-stat">
          <span class="device-stat-label">Ort. Süre</span>
          <span class="device-stat-value">${s.avg_repair_min != null ? sanitize(s.avg_repair_min) + ' dk' : '—'}</span>
        </div>
      </div>

      <div class="device-card-footer">
        <button class="btn btn-ghost btn-sm detail-btn" data-id="${sanitize(s.id)}">
          Detay Gör
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </button>
      </div>
    </div>`;
}

/* ── Grid render ─────────────────────────────────────────── */
function applyFilters() {
  let list = visibleStaffList(allStaff);

  if (activeFilter !== 'all') {
    list = list.filter(s => s.state === activeFilter);
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(s =>
      (s.id           || '').toLowerCase().includes(q) ||
      (s.display_name || '').toLowerCase().includes(q) ||
      (s.role         || '').toLowerCase().includes(q)
    );
  }

  const grid = document.getElementById('staffGrid');
  if (list.length === 0) {
    grid.innerHTML = '<div class="empty-state">Personel bulunamadı.</div>';
    return;
  }
  grid.innerHTML = list.map(renderCard).join('');

  grid.querySelectorAll('.detail-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openPanel(btn.dataset.id);
    });
  });

  grid.querySelectorAll('.device-card').forEach(card => {
    card.addEventListener('click', () => openPanel(card.dataset.id));
  });
}

/* ── Filtre butonları ────────────────────────────────────── */
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    applyFilters();
  });
});

/* ── Arama ───────────────────────────────────────────────── */
const searchInput = document.getElementById('searchInput');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    applyFilters();
  });
}

/* ── Detay panel ─────────────────────────────────────────── */
const overlay     = document.getElementById('panelOverlay');
const panel       = document.getElementById('detailPanel');
const panelClose  = document.getElementById('panelClose');
const panelTitle  = document.getElementById('panelTitle');
const panelBody   = document.getElementById('panelBody');
const panelFooter = document.getElementById('panelFooter');

function openPanel(id) {
  panelTitle.textContent = 'Yükleniyor…';
  panelBody.innerHTML    = '<div class="panel-loading">Veri yükleniyor…</div>';
  panelFooter.innerHTML  = '';
  panel.classList.add('open');
  overlay.classList.add('visible');

  API.getStaffDetail(id).then(s => {
    if (!s) {
      panelBody.innerHTML = '<div class="panel-loading">Personel bulunamadı.</div>';
      return;
    }

    panelTitle.textContent = s.display_name || s.id;

    const badgeCls   = STATE_BADGE[s.state] || 'badge-gray';
    const stateLabel = STATE_LABEL[s.state] || s.state;
    const initials   = (s.display_name || s.id).split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const color      = avatarColor(s.id);
    const battery    = s.battery != null ? s.battery : null;
    const bColor     = batteryColor(battery);
    /* Aktif görev bilgisi */
    const activeTaskHtml = s.state === 'IN_PROGRESS' && s.active_elev_name ? `
      <div class="panel-section" style="background:rgba(99,102,241,.05);border:1px solid rgba(99,102,241,.15);border-radius:var(--radius);padding:14px 16px;">
        <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--accent);margin-bottom:8px;">Aktif Görev</div>
        <div style="font-size:.85rem;font-weight:600;color:var(--text-primary);">${sanitize(s.active_elev_name)}</div>
        <div style="font-size:.78rem;color:var(--text-secondary);margin-top:3px;">Görev devam ediyor</div>
      </div>` : '';

    /* Görev tablosu */
    const TASK_STATUS = {
      assigned:    { cls: 'badge-amber', label: 'Devam Ediyor' },
      accepted:    { cls: 'badge-blue',  label: 'Devam Ediyor' },
      in_progress: { cls: 'badge-blue',  label: 'Devam Ediyor' },
      completed:   { cls: 'badge-green', label: 'Çözüldü' },
      rejected:    { cls: 'badge-red',   label: 'Reddedildi' },
      timeout:     { cls: 'badge-red',   label: 'Zaman Aşımı' },
    };
    const tasks = (s.tasks || []).map(t => ({
      ...t,
      asset_name: elevMap[t.asset_id] || t.asset_id || '—',
      total_min: t.duration_min != null ? parseInt(t.duration_min) : null,
      status: TASK_STATUS[t.status] || { cls: 'badge-gray', label: t.status || '—' },
    }));
    const taskRows = tasks.length
      ? tasks.map(t => `
          <tr>
            <td class="mono" style="font-size:.72rem">${sanitize(t.id)}</td>
            <td>${sanitize(t.asset_name || '—')}</td>
            <td>${sanitize(t.fault_type || '—')}</td>
            <td><span class="badge ${t.status.cls}">${sanitize(t.status.label)}</span></td>
            <td>${t.total_min != null ? t.total_min + ' dk' : '—'}</td>
          </tr>`).join('')
      : '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:16px 0;">Görev kaydı yok</td></tr>';

    panelBody.innerHTML = `
      <div class="panel-section" style="display:flex;align-items:center;gap:14px;padding-bottom:20px;border-bottom:1px solid var(--border);margin-bottom:20px;">
        <div class="avatar avatar-lg" style="background:${color};">${sanitize(initials)}</div>
        <div>
          <div style="font-size:1rem;font-weight:700;color:var(--text-primary);">${sanitize(s.display_name || s.id)}</div>
          <div style="font-size:.8rem;color:var(--text-secondary);margin-top:2px;">${sanitize(s.role || '—')}</div>
          <span class="badge ${badgeCls}" style="margin-top:6px;">${sanitize(stateLabel)}</span>
        </div>
      </div>

      ${activeTaskHtml}

      <div class="panel-section">
        <div class="panel-kv">
          <span class="panel-k">Kart ID</span>
          <span class="panel-v mono">${sanitize(s.id)}</span>
        </div>
        ${battery != null ? `
        <div class="panel-kv">
          <span class="panel-k">Batarya</span>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-weight:600;color:${bColor};">${battery}%</span>
            <div class="battery-track" style="width:80px;">
              <div class="battery-fill" style="width:${battery}%;background:${bColor};"></div>
            </div>
          </div>
        </div>` : ''}
        <div class="panel-kv">
          <span class="panel-k">Son Görülme</span>
          <span class="panel-v">${sanitize(s.last_seen_str || '—')}</span>
        </div>
        <div class="panel-kv">
          <span class="panel-k">Online</span>
          <span class="panel-v">${s.online ? '<span class="badge badge-green">Çevrimiçi</span>' : '<span class="badge badge-gray">Çevrimdışı</span>'}</span>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-section-title">Teknik Bilgiler</div>
        <div class="panel-kv">
          <span class="panel-k">IoT Thing</span>
          <span class="panel-v mono">${sanitize(s.iot_thing || '—')}</span>
        </div>
        <div class="panel-kv">
          <span class="panel-k">FW Sürümü</span>
          <span class="panel-v mono">${sanitize(s.fw_version || '—')}</span>
        </div>
        <div class="panel-kv">
          <span class="panel-k">En Yakın Beacon</span>
          <span class="panel-v mono" style="font-size:.72rem;word-break:break-all">${sanitize(s.nearest_beacon || '—')}</span>
        </div>
        <div class="panel-kv">
          <span class="panel-k">Beacon RSSI</span>
          <span class="panel-v">${s.nearest_rssi != null ? sanitize(s.nearest_rssi) : '—'}</span>
        </div>
        <div class="panel-kv">
          <span class="panel-k">Toplam Görev</span>
          <span class="panel-v">${s.total_tasks != null ? sanitize(s.total_tasks) : '—'}</span>
        </div>
        <div class="panel-kv">
          <span class="panel-k">Ort. Onarım</span>
          <span class="panel-v">${s.avg_repair_min != null ? sanitize(s.avg_repair_min) + ' dk' : '—'}</span>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-section-title">Görev Geçmişi</div>
        <div style="overflow-x:auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Task ID</th>
                <th>Endüstriyel Varlık</th>
                <th>Arıza Tipi</th>
                <th>Durum</th>
                <th>Süre</th>
              </tr>
            </thead>
            <tbody>${taskRows}</tbody>
          </table>
        </div>
      </div>`;
  }).catch(err => {
    console.error('[Staff] Detay alınamadı:', err);
    panelBody.innerHTML = '<div class="panel-loading">Veri alınamadı.</div>';
  });
}

function closePanel() {
  panel.classList.remove('open');
  overlay.classList.remove('visible');
}

panelClose.addEventListener('click', closePanel);
overlay.addEventListener('click', closePanel);

/* ── Veri yükleme ────────────────────────────────────────── */
async function loadStaff() {
  try {
    allStaff = await API.getStaff();
    try {
      allAssets = await API.getAssets();
      elevMap = Object.fromEntries(allAssets.map(e => [e.id, e.label || e.id]));
    } catch (e) { console.warn('[Staff] Asset yüklenemedi:', e); }
    applyFilters();
  } catch (err) {
    console.error('[Staff] Veri alınamadı:', err);
    document.getElementById('staffGrid').innerHTML =
      '<div class="empty-state">Veri yüklenemedi.</div>';
  }
}

Notify.init();
loadStaff();
setInterval(loadStaff, CONFIG.POLL_INTERVAL_MS);

