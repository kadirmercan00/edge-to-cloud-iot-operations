/* ============================================================
   EDGE-OPS AI — overview.js
   Ana Kontrol Merkezi — Endüstriyel Varlık + WC kombine görünüm
   ============================================================ */
'use strict';

function safe(str) {
  if (typeof sanitize === 'function') return sanitize(str);
  return String(str ?? '').replace(/[<>"'&]/g, c => ({'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','&':'&amp;'}[c]));
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 60000);
  if (diff < 1) return 'Az önce';
  if (diff < 60) return diff + ' dk önce';
  return Math.floor(diff / 60) + ' sa önce';
}

/* ── Saat ── */
function updateClock() {
  const el = document.getElementById('clock');
  if (el) el.textContent = new Date().toLocaleTimeString('tr-TR');
}
setInterval(updateClock, 1000);
updateClock();

/* ── Mode badge ── */
const badge = document.getElementById('modeBadge');
if (badge) {
  badge.textContent = CONFIG.MOCK_MODE ? 'MOCK' : 'CANLI';
  badge.className = 'topbar-badge ' + (CONFIG.MOCK_MODE ? 'mock' : 'live');
}

/* ── Endüstriyel Varlık mini card ── */
function renderAssetMini(Assets) {
  const grid = document.getElementById('AssetMiniGrid');
  if (!grid) return;

  const statusLabel = { operational: 'Çalışıyor', breakdown: 'Arızalı', idle: 'Boşta' };
  const statusBadge = {
    operational: '<span class="badge badge-green">Çalışıyor</span>',
    breakdown:   '<span class="badge badge-red">Arızalı</span>',
    idle:        '<span class="badge badge-amber">Boşta</span>',
  };

  grid.innerHTML = Assets.map(e => `
    <a href="assets.html" class="Asset-mini-card ${e.status}">
      <div class="elev-mini-top">
        <span class="elev-mini-label"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:-2px;margin-right:6px;display:inline-block;color:#10b981;"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="6" x2="12" y2="10"/><polyline points="9 8 12 6 15 8"/></svg>${safe(e.label)}</span>
        ${statusBadge[e.status] || ''}
      </div>
      <div class="elev-mini-meta">${safe(e.floor)} · ${safe(e.zone)}</div>
      <div class="elev-mini-meta">Uptime: ${e.uptime_pct}% · ${timeAgo(e.last_seen)}</div>
    </a>`).join('');
}

/* ── WC mini card ── */
function renderWcMini(locations) {
  const grid = document.getElementById('wcMiniGrid');
  const alerts = document.getElementById('wcAlerts');
  if (!grid) return;

  const critCount = locations.filter(l => l.aggregate_status === 'critical').length;
  const warnCount = locations.filter(l => l.aggregate_status === 'warning').length;
  if (alerts) {
    alerts.innerHTML = '';
    if (critCount > 0) alerts.innerHTML += `<span class="badge badge-red">Kritik: ${critCount}</span>`;
    if (warnCount > 0) alerts.innerHTML += `<span class="badge badge-amber">Uyarı: ${warnCount}</span>`;
  }

  const levelClass = (s) => ({ critical:'critical', warning:'warning', normal:'ok', offline:'offline' }[s] || 'offline');

  grid.innerHTML = locations.map(loc => {
    const st = loc.aggregate_status;
    const levelDevices = loc.devices.filter(d => d.type === 'soap' || d.type === 'paper');
    const dryer = loc.devices.find(d => d.type === 'dryer');

    const rows = levelDevices.map(d => {
      const lvl = d.level_pct ?? 0;
      const cls = levelClass(d.status);
      return `
        <div class="wc-mini-row">
          <span class="wc-mini-icon">${d.icon}</span>
          <div class="wc-mini-bar"><div class="wc-mini-fill ${cls}" style="width:${d.status==='offline'?100:lvl}%;"></div></div>
          <span class="wc-mini-val ${cls}">${d.level_pct != null ? d.level_pct+'%' : '—'}</span>
        </div>`;
    }).join('');

    const dryerRow = dryer ? `
      <div class="wc-mini-row">
        <span class="wc-mini-icon"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:middle;display:inline-block;color:#f59e0b;"><path d="M9.59 4.59A2 2 0 1111 8H2m10.59 11.59A2 2 0 1014 16H2"/></svg></span>
        <span style="font-size:.62rem;color:${dryer.fault?'#DC2626':dryer.status==='offline'?'#94A3B8':'#16A34A'};font-weight:700;">
          ${dryer.fault ? 'Arıza' : dryer.status==='offline' ? 'Offline' : 'OK'}
        </span>
      </div>` : '';

    const hasTask = st === 'critical' || (st === 'warning' && loc.devices.some(d => d.level_pct != null && d.level_pct < d.threshold_low));

    return `
      <div class="wc-mini-card ${st}">
        <div class="wc-mini-header ${st}">
          <span class="wc-mini-name">${safe(loc.label)}</span>
          <span style="font-size:.65rem;font-weight:700;color:${st==='critical'?'#DC2626':st==='warning'?'#D97706':st==='offline'?'#94A3B8':'#16A34A'};">
            ${st==='critical'?'KRİTİK':st==='warning'?'UYARI':st==='offline'?'OFFLİNE':'NORMAL'}
          </span>
        </div>
        <div class="wc-mini-body">
          ${rows}
          ${dryerRow}
        </div>
        ${hasTask ? '<div class="wc-mini-task">Görev oluşturuldu</div>' : ''}
      </div>`;
  }).join('');
}

/* ── KPI Şeridi ── */
function renderTopKPIs(elevSummary, wcSummary) {
  const set = (id, val, cls) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val ?? '—';
    if (cls) {
      const box = document.getElementById(id + 'Box');
      if (box) box.className = 'top-kpi ' + cls;
    }
  };

  set('kElTotal', elevSummary.stats?.total_Assets);
  set('kElFault', elevSummary.stats?.fault_count, elevSummary.stats?.fault_count > 0 ? 'alert' : 'ok');
  set('kElStaff', elevSummary.stats?.total_personnel);
  set('kWcTotal', wcSummary.total);
  set('kWcCrit', wcSummary.critical, wcSummary.critical > 0 ? 'alert' : 'ok');
  set('kTasks', (elevSummary.stats?.open_tasks || 0) + (wcSummary.open_tasks || 0));

  const lu = document.getElementById('lastUpdate');
  if (lu) lu.textContent = '· ' + new Date().toLocaleTimeString('tr-TR') + ' güncellendi';
}

/* ── Aktivite ── */
function renderActivity(items, elementId, dotMap) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.innerHTML = (items || []).slice(0, 6).map(a => `
    <div class="activity-item">
      <div class="activity-dot ${a.dot || 'info'}"></div>
      <div class="activity-text">${safe(a.text)}</div>
      <div class="activity-time mono">${safe(a.time || a.ts || '')}</div>
    </div>`).join('') || '<div style="color:var(--text-muted);font-size:.8rem;padding:8px 0;">Aktivite yok</div>';
}

/* ── Endüstriyel Varlık aktivite mock ── */
function getElevActivity(summary) {
  const items = [];
  if (summary.recent_events) return summary.recent_events;
  // Fallback mock activity
  return [
    { text: 'Endüstriyel Varlık-2 arıza bildirimi alındı', time: '14:22', dot: 'fault' },
    { text: 'Ali Kaya göreve atandı — Endüstriyel Varlık-2', time: '14:25', dot: 'info' },
    { text: 'Endüstriyel Varlık-1 rutin bakım tamamlandı', time: '13:50', dot: 'ok' },
    { text: 'Endüstriyel Varlık-3 düşük batarya uyarısı', time: '13:15', dot: 'warn' },
  ];
}

/* ── Ana yükle ── */
async function loadData() {
  try {
    const [elevSummary, Assets] = await Promise.all([
      API.getSummary(),
      API.getAssets(),
    ]);

    renderTopKPIs(elevSummary, {});
    renderAssetMini(Assets);
    renderActivity(getElevActivity(elevSummary), 'elevActivityList');

  } catch (err) {
    console.error('Overview yükleme hatası:', err);
  }
}

loadData();
setInterval(loadData, 15000); // 15s refresh for overview

