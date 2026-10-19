'use strict';

Auth.guardPage();
Auth.applyRoleUI();

(function () {
  const user = Auth.getCurrentUser();
  const av = document.getElementById('userAvatar');
  if (user && av) {
    av.textContent = (user.name || '').slice(0, 2).toUpperCase();
    av.title = user.name + ' — ' + (user.role || '');
  }
})();

function updateClock() {
  const el = document.getElementById('clock');
  if (el) el.textContent = new Date().toLocaleTimeString('tr-TR');
}
updateClock();
setInterval(updateClock, 1000);

document.getElementById('logoutBtn').addEventListener('click', (e) => {
  e.preventDefault();
  Auth.logout();
});

let sensors = [];
let selectedSensorId = '';
let searchTerm = '';
let currentSensorDetail = null;

function el(id) {
  return document.getElementById(id);
}

function numberOrNull(id) {
  const value = el(id)?.value;
  if (value === '' || value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function fmtTs(value) {
  if (!value) return '—';
  const num = Number(value);
  const ts = Number.isFinite(num) ? (num > 1e12 ? num : num * 1000) : Date.parse(value);
  if (!ts) return '—';
  return new Date(ts).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

function statusBadge(sensor) {
  const state = sensor.current_state || sensor.status || 'unknown';
  const cls = sensor.statusColor === 'red' ? 'badge-red'
    : sensor.statusColor === 'amber' ? 'badge-amber'
    : sensor.statusColor === 'green' ? 'badge-green'
    : 'badge-gray';
  return `<span class="badge ${cls}">${sanitize(state)}</span>`;
}

function renderSummary() {
  const empty = sensors.filter(s => (s.current_state || s.status) === 'empty').length;
  const low = sensors.filter(s => (s.current_state || s.status) === 'low').length;
  const full = sensors.filter(s => (s.current_state || s.status) === 'full').length;
  document.getElementById('sensorTotal').textContent = sensors.length;
  document.getElementById('sensorEmpty').textContent = empty;
  document.getElementById('sensorLow').textContent = low;
  document.getElementById('sensorFull').textContent = full;
}

function filteredSensors() {
  const q = searchTerm.toLowerCase();
  if (!q) return sensors;
  return sensors.filter(sensor => {
    return [
      sensor.sensor_id,
      sensor.label,
      sensor.location_label,
      sensor.product_type,
      sensor.gateway_id,
    ].some(value => String(value || '').toLowerCase().includes(q));
  });
}

function renderTable() {
  const tbody = document.getElementById('sensorTableBody');
  const rows = filteredSensors();
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">Sensör bulunamadı.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(sensor => `
    <tr data-sensor-id="${sanitize(sensor.sensor_id)}" class="${sensor.sensor_id === selectedSensorId ? 'selected-row' : ''}" style="cursor:pointer;">
      <td>
        <div style="font-weight:700;">${sanitize(sensor.label || sensor.sensor_id)}</div>
        <div style="font-size:.75rem;color:var(--text-muted);">${sanitize(sensor.location_label || '')}</div>
      </td>
      <td>${sanitize(sensor.product_type || '—')}</td>
      <td>${statusBadge(sensor)}</td>
      <td>${sanitize(String(sensor.level_pct ?? '—'))}%</td>
      <td>${sanitize(String(sensor.distance_mm ?? '—'))} mm</td>
      <td>${sensor.open_task_id ? `<span class="badge badge-blue mono">${sanitize(sensor.open_task_id)}</span>` : '—'}</td>
    </tr>
  `).join('');

  tbody.querySelectorAll('tr[data-sensor-id]').forEach(row => {
    row.addEventListener('click', () => {
      selectedSensorId = row.dataset.sensorId;
      renderTable();
      loadSensorDetail(selectedSensorId);
    });
  });
}

function renderSnapshot(detail) {
  document.getElementById('selectedSensorTitle').textContent = detail.label || detail.sensor_id;
  document.getElementById('selectedSensorMeta').textContent = `${detail.gateway_id || 'gateway?'} · ${detail.mac || 'mac yok'}`;
  const locationParts = [detail.facility, detail.building, detail.floor, detail.zone, detail.location_label].filter(Boolean);
  document.getElementById('sensorSnapshot').innerHTML = [
    ['Durum', detail.current_state || detail.status || '—'],
    ['Mesafe', `${detail.distance_mm ?? '—'} mm`],
    ['Seviye', `${detail.level_pct ?? '—'}%`],
    ['Konum', locationParts.join(' / ') || detail.location_label || '---'],
    ['Açık Görev', detail.open_task_id || '—'],
    ['Son Görülme', detail.last_seen_str || fmtTs(detail.last_seen)],
  ].map(([label, value]) => `
    <div style="padding:12px 14px;border:1px solid var(--border-color);border-radius:var(--radius-sm);background:var(--bg-app);">
      <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:6px;">${sanitize(label)}</div>
      <div style="font-size:.95rem;color:var(--text-primary);">${sanitize(String(value))}</div>
    </div>
  `).join('');
}

function renderUsage(detail) {
  const container = document.getElementById('sensorUsageList');
  const usage = detail.usage || [];
  if (!usage.length) {
    container.innerHTML = '<div style="color:var(--text-muted);">Henüz usage kaydı yok.</div>';
    return;
  }
  container.innerHTML = usage.slice(0, 5).map(row => `
    <div style="display:flex;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid var(--border-color);border-radius:var(--radius-sm);background:var(--bg-app);">
      <span class="mono">${sanitize(row.day || '—')}</span>
      <span>Kullanım: ${sanitize(String(row.usage_count ?? 0))}</span>
      <span>Boş: ${sanitize(String(row.empty_count ?? 0))}</span>
      <span>Dolum: ${sanitize(String(row.refill_count ?? 0))}</span>
    </div>
  `).join('');
}

function renderHistory(detail) {
  const tbody = document.getElementById('sensorHistoryBody');
  const history = detail.history || [];
  if (!history.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:18px;color:var(--text-muted);">Kayıt bulunamadı</td></tr>';
    return;
  }
  tbody.innerHTML = history.map(row => `
    <tr>
      <td>${sanitize(fmtTs(row.ts))}</td>
      <td>${sanitize(row.current_state || '—')}</td>
      <td>${sanitize(String(row.level_pct ?? '—'))}%</td>
      <td>${sanitize(String(row.distance_mm ?? '—'))} mm</td>
    </tr>
  `).join('');
}

function fillConfigForm(detail) {
  currentSensorDetail = detail;
  document.getElementById('sensorIdInput').value = detail.sensor_id ?? detail.id ?? '';
  document.getElementById('sensorNameInput').value = detail.label ?? detail.display_name ?? '';
  document.getElementById('distFullInput').value = detail.dist_full ?? '';
  document.getElementById('distEmptyInput').value = detail.dist_empty ?? '';
  document.getElementById('refillThresholdInput').value = detail.refill_threshold ?? '';
  document.getElementById('emptyConfirmInput').value = detail.empty_confirm_needed ?? '';
  document.getElementById('productTypeInput').value = detail.product_type || 'paper_towel';
  document.getElementById('publishModeInput').value = detail.publish_mode || 'on_change';
  if (el('facilityInput')) el('facilityInput').value = detail.facility || '';
  if (el('buildingInput')) el('buildingInput').value = detail.building || '';
  if (el('floorInput')) el('floorInput').value = detail.floor || '';
  if (el('zoneInput')) el('zoneInput').value = detail.zone || '';
  document.getElementById('locationLabelInput').value = detail.location_label || '';
  updateCalibrationPreview();
  showCommandStatus(null);
}

function updateCalibrationPreview() {
  const box = el('calibrationPreview');
  if (!box) return;
  const full = numberOrNull('distFullInput');
  const empty = numberOrNull('distEmptyInput');
  const current = currentSensorDetail?.distance_mm == null ? null : Number(currentSensorDetail.distance_mm);
  const invalid = full != null && empty != null && full >= empty;

  if (invalid) {
    box.style.borderColor = 'rgba(239,68,68,.45)';
    box.style.color = '#b91c1c';
    box.textContent = 'Kalibrasyon hatasi: Dolu mesafe, bos mesafeden kucuk olmali.';
    return;
  }

  box.style.borderColor = 'var(--border-color)';
  box.style.color = 'var(--text-secondary)';
  if (full == null || empty == null) {
    box.textContent = 'Dolu ve bos mesafe girildiginde seviye araligi burada gorunur.';
    return;
  }

  let preview = 'Son okuma yok';
  if (current != null && Number.isFinite(current)) {
    const pct = Math.max(0, Math.min(100, Math.round(((empty - current) / (empty - full)) * 100)));
    preview = `Son okuma ${current} mm ise yaklasik seviye: ${pct}%`;
  }
  box.textContent = `Aralik: ${full} mm dolu -> ${empty} mm bos. ${preview}.`;
}

function showCommandStatus(result) {
  const box = el('commandStatusBox');
  if (!box) return;
  if (!result) {
    box.style.display = 'none';
    box.textContent = '';
    return;
  }
  const publish = result.mqtt_publish || {};
  const command = result.queued_command || {};
  const queuedCount = Array.isArray(result.queued_commands) ? result.queued_commands.length : (command.command_id ? 1 : 0);
  const status = publish.status || (command.command_id ? 'queued' : 'skipped');
  const topic = publish.topic ? ` | Topic: ${publish.topic}` : '';
  const reason = publish.reason ? ` | ${publish.reason}` : '';
  box.style.display = 'block';
  box.style.borderColor = status === 'failed' ? 'rgba(239,68,68,.45)' : 'rgba(59,130,246,.35)';
  box.textContent = `Komut durumu: ${status}. Komut: ${publish.command_id || command.command_id || '-'} | Kuyruk: ${queuedCount}${topic}${reason}`;
}

async function loadSensorDetail(sensorId) {
  try {
    const detail = await API.getSensorDetail(sensorId);
    if (!detail) return;
    renderSnapshot(detail);
    renderUsage(detail);
    renderHistory(detail);
    fillConfigForm(detail);
  } catch (err) {
    console.error('[Sensors] Detay alınamadı:', err);
  }
}

async function loadSensors() {
  try {
    sensors = await API.getSensors();
    renderSummary();
    if (!selectedSensorId && sensors.length) selectedSensorId = sensors[0].sensor_id || sensors[0].id;
    renderTable();
    if (selectedSensorId) await loadSensorDetail(selectedSensorId);
  } catch (err) {
    console.error('[Sensors] Liste alınamadı:', err);
  }
}

document.getElementById('sensorSearch').addEventListener('input', (e) => {
  searchTerm = e.target.value.trim();
  renderTable();
});

['distFullInput', 'distEmptyInput'].forEach(id => {
  el(id)?.addEventListener('input', updateCalibrationPreview);
});

document.getElementById('configForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedSensorId) return;
  
  const newSensorId = document.getElementById('sensorIdInput').value.trim();
  const distFull = numberOrNull('distFullInput');
  const distEmpty = numberOrNull('distEmptyInput');
  if (distFull == null || distEmpty == null || distFull >= distEmpty) {
    updateCalibrationPreview();
    if (typeof Notify !== 'undefined') Notify.error('Dolu mesafe, bos mesafeden kucuk olmali.');
    return;
  }
  if (newSensorId !== selectedSensorId) {
    const ok = window.confirm(`Sensor ID ${selectedSensorId} -> ${newSensorId} olarak degisecek. Devam edilsin mi?`);
    if (!ok) return;
  }

  const payload = {
    sensor_id: newSensorId,
    display_name: document.getElementById('sensorNameInput').value.trim(),
    dist_full: distFull,
    dist_empty: distEmpty,
    refill_threshold: numberOrNull('refillThresholdInput'),
    empty_confirm_needed: numberOrNull('emptyConfirmInput'),
    product_type: document.getElementById('productTypeInput').value,
    publish_mode: document.getElementById('publishModeInput').value,
    facility: el('facilityInput')?.value.trim() || '',
    building: el('buildingInput')?.value.trim() || '',
    floor: el('floorInput')?.value.trim() || '',
    zone: el('zoneInput')?.value.trim() || '',
    location_label: document.getElementById('locationLabelInput').value.trim(),
  };
  
  try {
    const result = await API.updateSensorConfig(selectedSensorId, payload);
    
    // Eğer ID değiştiyse seçili ID'yi yeni ID yapalım
    if (newSensorId !== selectedSensorId) {
      selectedSensorId = newSensorId;
    }
    
    if (typeof Notify !== 'undefined') {
      const publish = result.mqtt_publish || {};
      Notify.success(`Ayar kaydedildi. MQTT: ${publish.status || 'queued'}${result.queued_command ? ` (${result.queued_command.command_id})` : ''}`);
    }
    showCommandStatus(result);
    await loadSensors();
  } catch (err) {
    console.error('[Sensors] Config kaydedilemedi:', err);
    if (typeof Notify !== 'undefined') {
      Notify.error(err.message || 'Ayar kaydedilemedi');
    }
  }
});

if (typeof Notify !== 'undefined' && Notify.init) Notify.init();
loadSensors();
setInterval(loadSensors, CONFIG.POLL_INTERVAL_MS);

