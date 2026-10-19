'use strict';

function safe(value) {
  if (typeof sanitize === 'function') return sanitize(value);
  return String(value ?? '').replace(/[<>"'&]/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' }[c]));
}

function timeAgo(ts) {
  if (!ts) return '-';
  const raw = Number(ts);
  const millis = Number.isFinite(raw) ? (raw > 1e12 ? raw : raw * 1000) : Date.parse(ts);
  if (!millis) return '-';
  const diff = Math.max(0, Math.floor((Date.now() - millis) / 60000));
  if (diff < 1) return 'Az once';
  if (diff < 60) return diff + ' dk once';
  if (diff < 1440) return Math.floor(diff / 60) + ' sa once';
  return Math.floor(diff / 1440) + ' gun once';
}

function updateClock() {
  const el = document.getElementById('clock');
  if (el) el.textContent = new Date().toLocaleTimeString('tr-TR');
}
setInterval(updateClock, 1000);
updateClock();

const modeBadge = document.getElementById('modeBadge');
if (modeBadge) {
  modeBadge.textContent = CONFIG.MOCK_MODE ? 'MOCK' : 'CANLI';
  modeBadge.className = 'topbar-badge ' + (CONFIG.MOCK_MODE ? 'mock' : 'live');
}

function statusBadge(label, cls) {
  return `<span class="badge ${cls}">${safe(label)}</span>`;
}

function renderAssetMini(Assets) {
  const grid = document.getElementById('AssetMiniGrid');
  if (!grid) return;
  const rows = Assets || [];
  if (!rows.length) {
    grid.innerHTML = '<div style="color:var(--text-muted);font-size:.8rem;">Asansor kaydi yok</div>';
    return;
  }

  const badges = {
    operational: statusBadge('Calisiyor', 'badge-green'),
    breakdown: statusBadge('Arizali', 'badge-red'),
    idle: statusBadge('Bosta', 'badge-amber'),
  };

  grid.innerHTML = rows.slice(0, 8).map(e => `
    <a href="assets.html" class="Asset-mini-card ${safe(e.status || 'idle')}">
      <div class="elev-mini-top">
        <span class="elev-mini-label">${safe(e.label || e.id || '-')}</span>
        ${badges[e.status] || statusBadge(e.status || 'Bilinmiyor', 'badge-gray')}
      </div>
      <div class="elev-mini-meta">${safe([e.building, e.floor, e.zone].filter(Boolean).join(' / ') || '-')}</div>
      <div class="elev-mini-meta">Uptime: ${safe(String(e.uptime_pct ?? '-'))}% / ${safe(timeAgo(e.last_seen))}</div>
    </a>
  `).join('');
}

function levelClass(state) {
  const normalized = String(state || '').toLowerCase();
  if (['full', 'normal', 'ok'].includes(normalized)) return 'ok';
  if (['low', 'warning'].includes(normalized)) return 'warning';
  if (['empty', 'critical'].includes(normalized)) return 'critical';
  return 'offline';
}

function stateLabel(state) {
  const normalized = String(state || '').toLowerCase();
  return {
    full: 'Dolu',
    normal: 'Normal',
    low: 'Az',
    warning: 'Uyari',
    empty: 'Bos',
    critical: 'Kritik',
    offline: 'Offline',
    unknown: 'Bilinmiyor',
  }[normalized] || (state || 'Bilinmiyor');
}

function groupSensorsAsLocations(sensors) {
  const grouped = new Map();
  (sensors || []).forEach(sensor => {
    // Sensörleri tekil olarak göstermek için key olarak sensor_id'yi önceliklendiriyoruz
    const key = sensor.sensor_id || sensor.device_group_id || sensor.location_label || sensor.gateway_id || 'restroom';
    if (!grouped.has(key)) {
      grouped.set(key, {
        id: key,
        label: sensor.label || sensor.display_name || sensor.sensor_id || 'Sensör',
        floor: sensor.floor || '',
        zone: sensor.building || sensor.facility || '',
        aggregate_status: 'normal',
        last_updated: 0,
        devices: [],
      });
    }
    const loc = grouped.get(key);
    const state = sensor.current_state || sensor.status || 'unknown';
    const pType = String(sensor.product_type || '').toLowerCase();
    const icon = pType.includes('soap') ? `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:middle;display:inline-block;color:#3b82f6;"><path d="M12 22a7 7 0 007-7V9a7 7 0 00-14 0v6a7 7 0 007 7z"/><path d="M12 2v3M12 5h3"/></svg>`
      : (pType.includes('paper') || pType.includes('towel') || pType.includes('napkin')) ? `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:middle;display:inline-block;color:#10b981;"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 00-10 10h20A10 10 0 0012 2z"/></svg>`
      : pType.includes('dryer') ? `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:middle;display:inline-block;color:#f59e0b;"><path d="M9.59 4.59A2 2 0 1111 8H2m10.59 11.59A2 2 0 1014 16H2"/></svg>`
      : pType.includes('traffic') ? `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:middle;display:inline-block;color:#8b5cf6;"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>`
      : `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:middle;display:inline-block;color:#94a3b8;"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83"/></svg>`;

    loc.last_updated = Math.max(loc.last_updated, Number(sensor.last_seen || 0));
    loc.devices.push({
      type: sensor.product_type || 'level',
      label: sensor.label || sensor.display_name || sensor.sensor_id,
      icon: icon,
      level_pct: sensor.level_pct,
      threshold_low: sensor.refill_threshold || 25,
      threshold_crit: 5,
      status: state === 'full' ? 'normal' : state === 'empty' ? 'critical' : state === 'low' ? 'warning' : state,
    });
  });

  return Array.from(grouped.values()).map(loc => {
    const classes = loc.devices.map(d => levelClass(d.status));
    loc.aggregate_status = classes.includes('critical') ? 'critical'
      : classes.includes('warning') ? 'warning'
      : classes.every(c => c === 'offline') ? 'offline'
      : 'normal';
    return loc;
  });
}

async function loadRestroomLocations() {
  const sensors = await API.getSensors();
  return groupSensorsAsLocations(sensors);
}

async function loadRestroomSummary(locations) {
  const counts = { total: locations.length, critical: 0, warning: 0, normal: 0, offline: 0, open_tasks: 0 };
  locations.forEach(loc => {
    if (counts[loc.aggregate_status] !== undefined) counts[loc.aggregate_status] += 1;
  });
  return counts;
}

function renderWcMini(locations) {
  const grid = document.getElementById('wcMiniGrid');
  const alerts = document.getElementById('wcAlerts');
  if (!grid) return;
  const rows = locations || [];
  if (!rows.length) {
    grid.innerHTML = '<div style="color:var(--text-muted);font-size:.8rem;">WC sensor kaydi yok</div>';
    if (alerts) alerts.innerHTML = '';
    return;
  }

  const critCount = rows.filter(l => l.aggregate_status === 'critical').length;
  const warnCount = rows.filter(l => l.aggregate_status === 'warning').length;
  if (alerts) {
    alerts.innerHTML = [
      critCount ? `<span class="badge badge-red">${critCount} Kritik</span>` : '',
      warnCount ? `<span class="badge badge-amber">${warnCount} Uyari</span>` : '',
    ].join('');
  }

  grid.innerHTML = rows.slice(0, 12).map(loc => {
    const st = loc.aggregate_status || 'normal';
    const devices = (loc.devices || []).slice(0, 4);
    const lines = devices.map(d => {
      const cls = levelClass(d.status);
      const value = d.level_pct == null ? '-' : Math.max(0, Math.min(100, Number(d.level_pct) || 0));
      return `
        <div class="wc-mini-row">
          <span class="wc-mini-icon">${d.icon || safe((d.label || '?').slice(0, 1).toUpperCase())}</span>
          <div class="wc-mini-bar"><div class="wc-mini-fill ${cls}" style="width:${d.level_pct == null ? 100 : value}%;"></div></div>
          <span class="wc-mini-val ${cls}">${d.level_pct == null ? '-' : value + '%'}</span>
        </div>`;
    }).join('');

    return `
      <div class="wc-mini-card ${safe(st)}">
        <div class="wc-mini-header ${safe(st)}">
          <span class="wc-mini-name">${safe(loc.label)}</span>
          <span style="font-size:.65rem;font-weight:700;">${safe(stateLabel(st))}</span>
        </div>
        <div class="wc-mini-body">${lines}</div>
        ${st === 'critical' ? '<div class="wc-mini-task">Gorev olustu</div>' : ''}
      </div>`;
  }).join('');
}

function renderTopKPIs(elevSummary, wcSummary) {
  const stats = elevSummary.stats || {};
  const set = (id, val, cls) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val ?? '-';
    const box = document.getElementById(id + 'Box');
    if (box && cls) box.className = 'top-kpi ' + cls;
  };

  set('kElTotal', stats.total_Assets);
  set('kElFault', stats.fault_count, stats.fault_count > 0 ? 'alert' : 'ok');
  set('kElStaff', stats.total_personnel);
  set('kWcTotal', wcSummary.total);
  set('kWcCrit', wcSummary.critical, wcSummary.critical > 0 ? 'alert' : 'ok');
  set('kTasks', Number(stats.open_tasks || 0) + Number(wcSummary.open_tasks || 0));

  const lastUpdate = document.getElementById('lastUpdate');
  if (lastUpdate) lastUpdate.textContent = new Date().toLocaleTimeString('tr-TR') + ' guncellendi';
}

function renderActivity(items, elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const rows = items || [];
  el.innerHTML = rows.slice(0, 6).map(item => `
    <div class="activity-item">
      <div class="activity-dot ${safe(item.dot || item.type || 'info')}"></div>
      <div class="activity-text">${safe(item.text || item.fault_type || '-')}</div>
      <div class="activity-time mono">${safe(item.time || item.ts || '')}</div>
    </div>
  `).join('') || '<div style="color:var(--text-muted);font-size:.8rem;padding:8px 0;">Aktivite yok</div>';
}

async function loadRestroomActivity() {
  const tasks = await API.getTasks().catch(() => []);
  return (tasks || [])
    .filter(t => t.asset_type === 'sensor' || t.task_type === 'sensor_alert')
    .map(t => ({ text: `${t.asset_name || t.sensor_id || 'Sensor'} - ${t.fault_type || 'uyari'}`, time: timeAgo(t.ts_created), dot: t.priority === 'high' ? 'fault' : 'warn' }));
}

function getElevActivity(summary) {
  const log = summary.activity_log || summary.recent_events || [];
  return log.length ? log : [
    { text: 'Endüstriyel varlıklar izleniyor', time: 'canli', dot: 'info' },
  ];
}

// Local cache yükleme (Sıfır gecikmeli ilk yükleme için)
function tryLoadFromCache() {
  try {
    const cachedSummary = localStorage.getItem('edgeops_cache_dash_summary');
    const cachedAssets = localStorage.getItem('edgeops_cache_dash_Assets');

    if (cachedSummary) {
      const summaryObj = JSON.parse(cachedSummary);
      renderTopKPIs(summaryObj, {});
      renderCharts(summaryObj);
    }
    if (cachedAssets) {
      renderAssetMini(JSON.parse(cachedAssets));
    }
  } catch (err) {
    console.warn('[Dashboard] Cache load error:', err);
  }
}

async function loadData() {
  try {
    const [elevSummary, Assets, wcLocations, wcActivity] = await Promise.all([
      API.getSummary(),
      API.getAssets(),
      loadRestroomLocations(),
      loadRestroomActivity(),
    ]);
    const wcSummary = await loadRestroomSummary(wcLocations);

    renderTopKPIs(elevSummary, wcSummary);
    renderAssetMini(Assets);
    renderActivity(getElevActivity(elevSummary), 'elevActivityList');
    renderCharts(elevSummary);

    // Başarılı veriyi cache'e yazalım
    try {
      localStorage.setItem('edgeops_cache_dash_summary', JSON.stringify(elevSummary));
      localStorage.setItem('edgeops_cache_dash_Assets', JSON.stringify(Assets));
      localStorage.setItem('edgeops_cache_dash_act', JSON.stringify(getElevActivity(elevSummary)));
    } catch (e) {
      console.warn('[Dashboard] Cache write error:', e);
    }
  } catch (err) {
    console.error('[Dashboard] Yukleme hatasi:', err);
    if (typeof Notify !== 'undefined' && !document.getElementById('kElTotal').textContent) {
      Notify.error('Kontrol merkezi yuklenemedi');
    }
  }
}

function renderCharts(summary) {
  const trend = summary.weeklyTrend || { labels: [], faults: [] };
  const compare = summary.barChartData || { labels: [], faults: [], resolved: [] };
  
  // 1. Haftalık Trend (Indigo Line/Area)
  const ctxWeekly = document.getElementById('chartWeeklyTrend');
  if (ctxWeekly) {
    if (window.weeklyTrendChart) window.weeklyTrendChart.destroy();
    
    const gridColor = 'rgba(148, 163, 184, 0.08)';
    const textColor = '#94a3b8';
    
    window.weeklyTrendChart = new Chart(ctxWeekly, {
      type: 'line',
      data: {
        labels: trend.labels || [],
        datasets: [{
          label: 'Arıza Sayısı',
          data: trend.faults || [],
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.12)',
          fill: true,
          tension: 0.4,
          borderWidth: 2,
          pointBackgroundColor: '#6366f1',
          pointRadius: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { size: 9 }, stepSize: 1 },
            beginAtZero: true
          },
          x: {
            grid: { display: false },
            ticks: { color: textColor, font: { size: 9 } }
          }
        }
      }
    });
  }
  
  // 2. Aylık Karşılaştırma (Bar Chart)
  const ctxMonthly = document.getElementById('chartMonthlyCompare');
  if (ctxMonthly) {
    if (window.monthlyCompareChart) window.monthlyCompareChart.destroy();
    
    const gridColor = 'rgba(148, 163, 184, 0.08)';
    const textColor = '#94a3b8';
    
    window.monthlyCompareChart = new Chart(ctxMonthly, {
      type: 'bar',
      data: {
        labels: compare.labels || [],
        datasets: [
          {
            label: 'Arıza',
            data: compare.faults || [],
            backgroundColor: '#ef4444',
            borderRadius: 4,
            barPercentage: 0.5
          },
          {
            label: 'Çözüldü',
            data: compare.resolved || [],
            backgroundColor: '#10b981',
            borderRadius: 4,
            barPercentage: 0.5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: { color: textColor, font: { size: 9 }, boxWidth: 8, boxHeight: 8 }
          }
        },
        scales: {
          y: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { size: 9 }, stepSize: 1 },
            beginAtZero: true
          },
          x: {
            grid: { display: false },
            ticks: { color: textColor, font: { size: 9 } }
          }
        }
      }
    });
  }
}


if (typeof Notify !== 'undefined' && Notify.init) Notify.init();
tryLoadFromCache(); // Cache'ten anında yükle (0ms!)
loadData();         // Arka planda AWS'den en güncel veriyi çek
setInterval(loadData, CONFIG.POLL_INTERVAL_MS || 15000);

