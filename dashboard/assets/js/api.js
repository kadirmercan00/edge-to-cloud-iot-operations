/* ============================================================
   EDGE-OPS AI — api.js
   MOCK_MODE=true → mock.js | false → AWS Lambda
   ============================================================ */
'use strict';

const API = (() => {

  /* ── HTTP yardımcısı ─────────────────────────────────────── */
  async function req(baseUrl, path, options = {}) {
    const url = baseUrl + path;
    const headers = { 'Content-Type': 'application/json' };
    if (CONFIG.API_KEY) headers['X-Api-Key'] = CONFIG.API_KEY;
    const res = await fetch(url, { headers, ...options });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  function get(path)        { return req(CONFIG.ADMIN_API_URL, path); }
  function post(path, body) { return req(CONFIG.ADMIN_API_URL, path, { method:'POST', body: JSON.stringify(body) }); }

  /* ── ZIP indir (browser) ─────────────────────────────────── */
  function downloadZip(base64, filename) {
    if (base64 === 'MOCK_ZIP_DATA') {
      alert('MOCK MODE: Gerçek sertifika yok. MOCK_MODE=false yaparak AWS\'ye bağlanın.');
      return;
    }
    const bytes = atob(base64);
    const arr   = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const blob  = new Blob([arr], { type: 'application/zip' });
    const a     = document.createElement('a');
    a.href      = URL.createObjectURL(blob);
    a.download  = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ── PUBLIC ──────────────────────────────────────────────── */
  return {

    /* Dashboard özeti */
    async getSummary() {
      if (CONFIG.MOCK_MODE) return MOCK.getSummary();
      return get('/summary');
    },

    /* Endüstriyel Varlık listesi */
    async getAssets() {
      if (CONFIG.MOCK_MODE) return MOCK.getAssets();
      return get('/Assets');
    },

    /* Tek Endüstriyel Varlık detay */
    async getAssetDetail(id) {
      if (CONFIG.MOCK_MODE) return MOCK.getAssetDetail(id);
      return get('/Assets/' + encodeURIComponent(id));
    },

    /* Personel listesi */
    async getStaff() {
      if (CONFIG.MOCK_MODE) return MOCK.getStaff();
      return get('/staff');
    },

    /* Tek personel detay */
    async getStaffDetail(id) {
      if (CONFIG.MOCK_MODE) return MOCK.getStaffDetail(id);
      return get('/staff/' + encodeURIComponent(id));
    },

    /* Görevler */
    async getTasks(filter = '') {
      if (CONFIG.MOCK_MODE) return MOCK.getTasks(filter);
      return filter ? get('/tasks?filter=' + filter) : get('/tasks');
    },

    /* Sensor listesi */
    async getSensors() {
      if (CONFIG.MOCK_MODE) return MOCK.getSensors();
      return get('/sensors');
    },

    /* Tek sensor detay */
    async getSensorDetail(id) {
      if (CONFIG.MOCK_MODE) return MOCK.getSensorDetail(id);
      return get('/sensors/' + encodeURIComponent(id));
    },

    /* Sensor usage */
    async getSensorUsage(sensorId = '') {
      if (CONFIG.MOCK_MODE) return MOCK.getSensorUsage(sensorId);
      return sensorId
        ? get('/sensor-usage?sensor_id=' + encodeURIComponent(sensorId))
        : get('/sensor-usage');
    },

    /* Yeni Endüstriyel Varlık ekle → ZIP döner */
    async addAsset(formData) {
      if (CONFIG.MOCK_MODE) return MOCK.addAsset(formData);
      return post('/Assets', formData);
    },

    /* Yeni personel ekle → ZIP döner */
    async addStaff(formData) {
      if (CONFIG.MOCK_MODE) return MOCK.addStaff(formData);
      return post('/staff', formData);
    },

    /* Yeni sensor ekle */
    async addSensor(formData) {
      if (CONFIG.MOCK_MODE) return MOCK.addSensor(formData);
      return post('/sensors', formData);
    },

    /* Sensor ayarı güncelle */
    async updateSensorConfig(sensorId, formData) {
      if (CONFIG.MOCK_MODE) return MOCK.updateSensorConfig(sensorId, formData);
      return post('/sensors/' + encodeURIComponent(sensorId) + '/config', formData);
    },

    /* Görevi personele ata */
    async assignTask(taskId, cardId) {
      if (CONFIG.MOCK_MODE) {
        return { ok: true, task_id: taskId, card_id: cardId, topic: 'mock/topic' };
      }
      return post('/tasks/' + encodeURIComponent(taskId) + '/assign', { card_id: cardId });
    },

    /* Yardımcı: ZIP indir */
    downloadZip,

    /* Bağlantı modu */
    isMock() { return CONFIG.MOCK_MODE; },
  };
})();

