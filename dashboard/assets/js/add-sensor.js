'use strict';

Auth.guardPage();
Auth.guardRole(CONFIG.SUPERVISOR_ROLES);

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

document.getElementById('sensorForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    sensor_id: document.getElementById('sensorId').value.trim(),
    display_name: document.getElementById('displayName').value.trim(),
    gateway_id: document.getElementById('gatewayId').value.trim(),
    mac: document.getElementById('macAddress').value.trim(),
    product_type: document.getElementById('productType').value.trim(),
    assigned_card_id: document.getElementById('assignedCardId').value.trim() || 'card001',
    site: document.getElementById('site').value.trim() || 'facility-01',
    facility: document.getElementById('facility').value.trim(),
    building: document.getElementById('building').value.trim(),
    floor: document.getElementById('floor').value.trim(),
    location_label: document.getElementById('locationLabel').value.trim(),
    dist_full: Number(document.getElementById('distFull').value || 0) || null,
    dist_empty: Number(document.getElementById('distEmpty').value || 0) || null,
    refill_threshold: Number(document.getElementById('refillThreshold').value || 0) || null,
    empty_confirm_needed: Number(document.getElementById('emptyConfirmNeeded').value || 0) || null,
    publish_mode: document.getElementById('publishMode').value,
  };

  if (!payload.sensor_id) {
    if (typeof Notify !== 'undefined') Notify.error('Sensör ID gerekli');
    return;
  }

  try {
    const result = await API.addSensor(payload);
    document.getElementById('resultBox').innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px;">
        <strong>${result.label || result.sensor_id}</strong>
        <span class="mono">${result.sensor_id}</span>
        <span>Gateway: ${result.gateway_id || '—'}</span>
        <span>MAC: ${result.mac || '—'}</span>
      </div>
    `;
    if (typeof Notify !== 'undefined') Notify.success('Sensör kaydı oluşturuldu');
    e.target.reset();
    document.getElementById('assignedCardId').value = 'card001';
    document.getElementById('site').value = 'facility-01';
    document.getElementById('publishMode').value = 'on_change';
  } catch (err) {
    console.error('[AddSensor] Hata:', err);
    document.getElementById('resultBox').textContent = err.message || 'Sensör kaydedilemedi.';
    if (typeof Notify !== 'undefined') Notify.error(err.message || 'Sensör kaydedilemedi');
  }
});

if (typeof Notify !== 'undefined' && Notify.init) Notify.init();

