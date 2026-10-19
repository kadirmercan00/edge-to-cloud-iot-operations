/* ============================================================
   EDGE-OPS AI — mock.js
   Mock veri: 3 Endüstriyel Varlık, 2 personel, görev geçmişi
   MOCK_MODE=false iken bu dosyanın içeriği çalışmaz.
   ============================================================ */
'use strict';

if (typeof CONFIG !== 'undefined' && !CONFIG.MOCK_MODE) {
  // MOCK_MODE kapalı — içerik pasif
} else {

const MOCK = (() => {

  /* ── Varlıklar & Makineler ──────────────────────────────────────────── */
  const Assets = [
    {
      id: 'Asset_01', label: 'Endüstriyel Varlık-1', status: 'operational',
      site: 'facility-01', building: 'Ana Bina', floor: 'Zemin Kat', zone: 'Lobi',
      facility: 'Plant Alpha',
      beacon_uuid: '00000000-0000-0000-0000-000000010101',
      criticality: 1.2, iot_thing: 'edgeops_facility-01_asset_01',
      last_seen: Date.now() - 45000, uptime_pct: 97.4,
      total_tasks: 12, avg_repair_min: 18, fw_version: '3.5.2',
    },
    {
      id: 'Asset_02', label: 'Endüstriyel Varlık-2', status: 'breakdown',
      site: 'facility-01', building: 'B Blok', floor: '3. Kat', zone: 'Koridor',
      facility: 'Plant Alpha',
      beacon_uuid: '00000000-0000-0000-0000-000000020202',
      criticality: 1.5, iot_thing: 'edgeops_facility-01_asset_02',
      last_seen: Date.now() - 120000, uptime_pct: 88.2,
      total_tasks: 7, avg_repair_min: 23, fw_version: '3.5.2',
    },
    {
      id: 'Asset_03', label: 'Endüstriyel Varlık-3', status: 'idle',
      site: 'facility-01', building: 'C Blok', floor: '1. Kat', zone: 'Ofis',
      facility: 'Plant Alpha',
      beacon_uuid: '00000000-0000-0000-0000-000000030303',
      criticality: 1.0, iot_thing: 'edgeops_facility-01_asset_03',
      last_seen: Date.now() - 300000, uptime_pct: 99.1,
      total_tasks: 3, avg_repair_min: 14, fw_version: '3.5.1',
    },
  ];

  /* ── PERSONEL ─────────────────────────────────────────────── */
  const staff = [
    {
      id: 'card001', display_name: 'Mehmet Yılmaz', role: 'Baş Teknisyen',
      state: 'IDLE', battery: 78,
      nearest_beacon: '00000000-0000-0000-0000-000000010101',
      active_asset_id: '', last_seen: Date.now() - 60000, online: true,
      total_tasks: 47, avg_repair_min: 14.8,
      iot_thing: 'edgeops_smartbadge_card001', fw_version: '3.5.2',
    },
    {
      id: 'card002', display_name: 'Ali Kaya', role: 'Teknisyen',
      state: 'IN_PROGRESS', battery: 42,
      nearest_beacon: '00000000-0000-0000-0000-000000020202',
      active_asset_id: 'Asset_02', last_seen: Date.now() - 30000, online: true,
      total_tasks: 21, avg_repair_min: 22.3,
      iot_thing: 'edgeops_smartbadge_card002', fw_version: '3.5.2',
    },
  ];

  const sensors = [
    {
      id: 'SENSOR_TOWEL_01',
      sensor_id: 'SENSOR_TOWEL_01',
      display_name: 'Lobby Havlu 1',
      gateway_id: 'gateway001',
      mac: 'aa:bb:cc:dd:ee:01',
      product_type: 'paper_towel',
      site: 'facility-01',
      facility: 'Plant Alpha',
      building: 'Ana Bina',
      floor: 'Zemin Kat',
      location_label: 'Lobby WC',
      current_state: 'full',
      last_state: 'full',
      level_pct: 82,
      distance_mm: 175,
      dist_full: 120,
      dist_empty: 320,
      refill_threshold: 70,
      empty_confirm_needed: 2,
      publish_mode: 'on_change',
      assigned_card_id: 'card001',
      last_seen: Date.now() - 45000,
      open_task_id: '',
      usage_count: 34,
    },
    {
      id: 'SENSOR_NAPKIN_02',
      sensor_id: 'SENSOR_NAPKIN_02',
      display_name: 'Restoran Peçetelik 2',
      gateway_id: 'gateway001',
      mac: 'aa:bb:cc:dd:ee:02',
      product_type: 'napkin',
      site: 'facility-01',
      facility: 'Plant Alpha',
      building: 'Ana Bina',
      floor: '1. Kat',
      location_label: 'Restoran Giriş',
      current_state: 'empty',
      last_state: 'low',
      level_pct: 8,
      distance_mm: 302,
      dist_full: 110,
      dist_empty: 300,
      refill_threshold: 65,
      empty_confirm_needed: 2,
      publish_mode: 'on_change',
      assigned_card_id: 'card001',
      last_seen: Date.now() - 15000,
      open_task_id: 'TSK-1774900008',
      usage_count: 58,
    },
    {
      id: 'SENSOR_TOWEL_03',
      sensor_id: 'SENSOR_TOWEL_03',
      display_name: 'Spa Havlu 3',
      gateway_id: 'gateway001',
      mac: 'aa:bb:cc:dd:ee:03',
      product_type: 'paper_towel',
      site: 'facility-01',
      facility: 'Plant Alpha',
      building: 'Spa',
      floor: 'Giriş',
      location_label: 'Spa Lavabo',
      current_state: 'low',
      last_state: 'full',
      level_pct: 28,
      distance_mm: 256,
      dist_full: 120,
      dist_empty: 320,
      refill_threshold: 70,
      empty_confirm_needed: 2,
      publish_mode: 'on_change',
      assigned_card_id: 'card001',
      last_seen: Date.now() - 95000,
      open_task_id: '',
      usage_count: 41,
    },
    {
      id: 'SENSOR_NAPKIN_04',
      sensor_id: 'SENSOR_NAPKIN_04',
      display_name: 'Lobby Pecetelik 4',
      gateway_id: 'gateway001',
      mac: 'aa:bb:cc:dd:ee:04',
      product_type: 'napkin',
      site: 'facility-01',
      facility: 'Plant Alpha',
      building: 'Ana Bina',
      floor: 'Zemin Kat',
      location_label: 'Lobby WC',
      current_state: 'full',
      last_state: 'low',
      level_pct: 64,
      distance_mm: 188,
      dist_full: 115,
      dist_empty: 310,
      refill_threshold: 25,
      empty_confirm_needed: 2,
      publish_mode: 'on_change',
      assigned_card_id: 'card001',
      last_seen: Date.now() - 70000,
      open_task_id: '',
      usage_count: 29,
    },
  ];

  /* ── GÖREVLER ─────────────────────────────────────────────── */
  const tasks = [
    {
      id: 'TSK-1774900001', status: 'assigned',
      asset_id: 'Asset_02', assigned_to: 'card002',
      fault_type: 'breakdown', priority: 'high',
      ts_created:  Date.now() - 25*60000,
      ts_accepted: Date.now() - 23*60000,
      ts_arrived:  Date.now() - 18*60000,
      ts_fixed: null, ts_closed: null,
    },
    {
      id: 'TSK-1774800002', status: 'completed',
      asset_id: 'Asset_01', assigned_to: 'card001',
      fault_type: 'Motor Aşırı Isınma', priority: 'high',
      ts_created:  Date.now() - 3*3600000,
      ts_accepted: Date.now() - 3*3600000 + 2*60000,
      ts_arrived:  Date.now() - 3*3600000 + 9*60000,
      ts_fixed:    Date.now() - 3*3600000 + 27*60000,
      ts_closed:   Date.now() - 3*3600000 + 28*60000,
    },
    {
      id: 'TSK-1774700003', status: 'completed',
      asset_id: 'Asset_01', assigned_to: 'card001',
      fault_type: 'Kapı Sensörü', priority: 'normal',
      ts_created:  Date.now() - 24*3600000,
      ts_accepted: Date.now() - 24*3600000 + 3*60000,
      ts_arrived:  Date.now() - 24*3600000 + 10*60000,
      ts_fixed:    Date.now() - 24*3600000 + 21*60000,
      ts_closed:   Date.now() - 24*3600000 + 22*60000,
    },
    {
      id: 'TSK-1774600004', status: 'completed',
      asset_id: 'Asset_03', assigned_to: 'card001',
      fault_type: 'Güç Kesilmesi', priority: 'high',
      ts_created:  Date.now() - 48*3600000,
      ts_accepted: Date.now() - 48*3600000 + 4*60000,
      ts_arrived:  Date.now() - 48*3600000 + 11*60000,
      ts_fixed:    Date.now() - 48*3600000 + 19*60000,
      ts_closed:   Date.now() - 48*3600000 + 20*60000,
    },
    {
      id: 'TSK-1774500005', status: 'completed',
      asset_id: 'Asset_02', assigned_to: 'card002',
      fault_type: 'Mekanik Arıza', priority: 'high',
      ts_created:  Date.now() - 72*3600000,
      ts_accepted: Date.now() - 72*3600000 + 5*60000,
      ts_arrived:  Date.now() - 72*3600000 + 14*60000,
      ts_fixed:    Date.now() - 72*3600000 + 38*60000,
      ts_closed:   Date.now() - 72*3600000 + 40*60000,
    },
    {
      id: 'TSK-1774400006', status: 'completed',
      asset_id: 'Asset_01', assigned_to: 'card001',
      fault_type: 'Aşırı Yük', priority: 'normal',
      ts_created:  Date.now() - 96*3600000,
      ts_accepted: Date.now() - 96*3600000 + 2*60000,
      ts_arrived:  Date.now() - 96*3600000 + 8*60000,
      ts_fixed:    Date.now() - 96*3600000 + 16*60000,
      ts_closed:   Date.now() - 96*3600000 + 17*60000,
    },
    {
      id: 'TSK-1774300007', status: 'completed',
      asset_id: 'Asset_03', assigned_to: 'card002',
      fault_type: 'Hız Kontrol', priority: 'normal',
      ts_created:  Date.now() - 120*3600000,
      ts_accepted: Date.now() - 120*3600000 + 6*60000,
      ts_arrived:  Date.now() - 120*3600000 + 16*60000,
      ts_fixed:    Date.now() - 120*3600000 + 29*60000,
      ts_closed:   Date.now() - 120*3600000 + 30*60000,
    },
  ];

  /* ── GRAFIK VERİLERİ ─────────────────────────────────────── */
  tasks.push({
    id: 'TSK-1774900008', status: 'assigned',
    asset_id: 'SENSOR_NAPKIN_02', sensor_id: 'SENSOR_NAPKIN_02',
    task_type: 'sensor_alert', asset_type: 'sensor',
    assigned_to: 'card001',
    fault_type: 'empty', priority: 'high',
    ts_created: Date.now() - 18 * 60000,
    ts_accepted: null,
    ts_arrived: null,
    ts_fixed: null,
    ts_closed: null,
  });

  const barChartData = {
    labels:   ['Ekim','Kasım','Aralık','Ocak','Şubat','Mart'],
    faults:   [8, 5, 11, 7, 4, 8],
    resolved: [7, 5, 10, 7, 4, 7],
  };

  const weeklyTrend = {
    labels: ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'],
    faults: [2, 0, 3, 1, 2, 0, 1],
  };

  const sensorUsage = [
    { sensor_id: 'SENSOR_TOWEL_01', day: '20260512', usage_count: 12, level_drop_total: 12, empty_count: 0, refill_count: 0, last_aggregate_at: Math.floor(Date.now() / 1000) },
    { sensor_id: 'SENSOR_TOWEL_01', day: '20260513', usage_count: 16, level_drop_total: 16, empty_count: 0, refill_count: 1, last_aggregate_at: Math.floor(Date.now() / 1000) },
    { sensor_id: 'SENSOR_NAPKIN_02', day: '20260513', usage_count: 22, level_drop_total: 22, empty_count: 1, refill_count: 0, last_aggregate_at: Math.floor(Date.now() / 1000) },
    { sensor_id: 'SENSOR_NAPKIN_02', day: '20260514', usage_count: 18, level_drop_total: 18, empty_count: 1, refill_count: 1, last_aggregate_at: Math.floor(Date.now() / 1000) },
    { sensor_id: 'SENSOR_TOWEL_03', day: '20260514', usage_count: 11, level_drop_total: 11, empty_count: 0, refill_count: 0, last_aggregate_at: Math.floor(Date.now() / 1000) },
    { sensor_id: 'SENSOR_TOWEL_03', day: '20260515', usage_count: 15, level_drop_total: 15, empty_count: 0, refill_count: 1, last_aggregate_at: Math.floor(Date.now() / 1000) },
    { sensor_id: 'SENSOR_NAPKIN_04', day: '20260515', usage_count: 9, level_drop_total: 9, empty_count: 0, refill_count: 0, last_aggregate_at: Math.floor(Date.now() / 1000) },
    { sensor_id: 'SENSOR_NAPKIN_04', day: '20260516', usage_count: 14, level_drop_total: 14, empty_count: 0, refill_count: 1, last_aggregate_at: Math.floor(Date.now() / 1000) },
  ];

  /* ── YARDIMCI ────────────────────────────────────────────── */
  const elevMap  = Object.fromEntries(Assets.map(e => [e.id, e.label]));
  const staffMap = Object.fromEntries(staff.map(s => [s.id, s.display_name]));

  function elevStatus(s) {
    return s === 'operational' ? 'green' : s === 'breakdown' ? 'red' : 'amber';
  }
  function sensorStatus(s) {
    return s === 'empty' ? 'red' : s === 'low' ? 'amber' : s === 'full' ? 'green' : 'gray';
  }
  function staffStatus(s) {
    return s === 'IDLE' ? 'green' : s === 'IN_PROGRESS' ? 'blue' : s === 'EN_ROUTE' ? 'amber' : 'gray';
  }
  function fmtRelTime(ts) {
    const d = Date.now() - ts;
    if (d < 60000)   return 'Az önce';
    if (d < 3600000) return Math.round(d/60000) + ' dk önce';
    if (d < 86400000) return Math.round(d/3600000) + ' sa önce';
    return Math.round(d/86400000) + ' gün önce';
  }
  function fmtDt(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('tr-TR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
  }
  function calcMin(t) {
    if (!t.ts_created || !t.ts_fixed) return null;
    return Math.round((t.ts_fixed - t.ts_created) / 60000);
  }
  function taskBadge(s) {
    if (s === 'completed' || s === 'closed') return { label:'Çözüldü',      cls:'badge-green' };
    if (s === 'assigned')                    return { label:'Devam Ediyor',  cls:'badge-blue'  };
    return { label: s, cls: 'badge-gray' };
  }

  function mapTask(t) {
    return {
      id: t.id,
      asset_name: elevMap[t.asset_id] || (sensors.find(s => s.sensor_id === t.asset_id)?.display_name) || t.asset_id,
      fault_type: t.fault_type || 'breakdown',
      assigned_to_name: staffMap[t.assigned_to] || t.assigned_to,
      status: taskBadge(t.status),
      ts_created: fmtDt(t.ts_created),
      ts_fixed:   fmtDt(t.ts_fixed),
      total_min:  calcMin(t),
      priority:   t.priority,
    };
  }

  /* ── PUBLIC ──────────────────────────────────────────────── */
  return {

    login(username, password) {
      const u = (CONFIG.DEMO_USERS||[]).find(u => u.username===username && u.password===password);
      if (!u) return null;
      const user  = { name: u.name, role: u.role, username: u.username };
      const exp   = Date.now() + CONFIG.SESSION_DURATION_MS;
      const token = btoa(JSON.stringify({ exp, user }));
      return { token, user };
    },

    getSummary() {
      return {
        stats: {
          total_Assets: Assets.length,
          fault_count:     Assets.filter(e => e.status==='breakdown').length,
          total_personnel: staff.length,
          on_task_count:   staff.filter(s => s.state==='IN_PROGRESS').length,
          open_tasks:      tasks.filter(t => t.status==='assigned'||t.status==='in_progress').length,
          total_sensors:   sensors.length,
          empty_sensors:   sensors.filter(s => s.current_state === 'empty').length,
          low_sensors:     sensors.filter(s => s.current_state === 'low').length,
        },
        Assets: Assets.map(e => ({
          id: e.id, label: e.label, status: e.status,
          building: e.building, floor: e.floor,
          last_seen: e.last_seen, statusColor: elevStatus(e.status),
        })),
        staff: staff.map(s => ({
          id: s.id, display_name: s.display_name, state: s.state,
          battery: s.battery, last_seen: s.last_seen, online: s.online,
          statusColor: staffStatus(s.state), active_asset_id: s.active_asset_id,
          last_seen_str: fmtRelTime(s.last_seen),
        })),
        sensors: sensors.map(s => ({
          id: s.sensor_id,
          sensor_id: s.sensor_id,
          label: s.display_name,
          status: s.current_state,
          current_state: s.current_state,
          statusColor: sensorStatus(s.current_state),
          level_pct: s.level_pct,
          distance_mm: s.distance_mm,
          location_label: s.location_label,
          building: s.building,
          floor: s.floor,
          last_seen: s.last_seen,
          last_seen_str: fmtRelTime(s.last_seen),
          open_task_id: s.open_task_id,
        })),
        activity_log: [
          { type:'fault', text:'Asset_02 arıza bildirimi — breakdown', time:'25 dk önce' },
          { type:'info',  text:'card002 göreve atandı → Asset_02',     time:'25 dk önce' },
          { type:'ok',    text:'Asset_01 onarımı tamamlandı',           time:'3 sa önce'  },
          { type:'ok',    text:'card001 görevi başarıyla tamamladı',       time:'3 sa önce'  },
          { type:'warn',  text:'card002 bataryası %42 — düşük',            time:'1 sa önce'  },
        ],
        barChartData, weeklyTrend,
      };
    },

    getAssets() {
      return Assets.map(e => ({ ...e, statusColor: elevStatus(e.status), last_seen_str: fmtRelTime(e.last_seen) }));
    },

    getAssetDetail(id) {
      const e = Assets.find(x => x.id===id);
      if (!e) return null;
      return {
        ...e, statusColor: elevStatus(e.status), last_seen_str: fmtRelTime(e.last_seen),
        tasks: tasks.filter(t => t.asset_id===id).map(mapTask),
      };
    },

    getStaff() {
      return staff.map(s => ({
        ...s, statusColor: staffStatus(s.state), last_seen_str: fmtRelTime(s.last_seen),
        active_elev_name: elevMap[s.active_asset_id] || '',
      }));
    },

    getStaffDetail(id) {
      const s = staff.find(x => x.id===id);
      if (!s) return null;
      return {
        ...s, statusColor: staffStatus(s.state), last_seen_str: fmtRelTime(s.last_seen),
        active_elev_name: elevMap[s.active_asset_id] || '',
        tasks: tasks.filter(t => t.assigned_to===id).map(mapTask),
      };
    },

    getTasks(filter='') {
      return tasks.map(t => ({
        id:          t.id,
        asset_id:    t.asset_id,
        asset_name:  elevMap[t.asset_id] || (sensors.find(s => s.sensor_id === t.asset_id)?.display_name) || t.asset_id,
        sensor_id:   t.sensor_id || '',
        task_type:   t.task_type || 'Asset_alert',
        asset_type:  t.asset_type || 'Asset',
        assigned_to: t.assigned_to,
        fault_type:  t.fault_type,
        status:      t.status,
        priority:    t.priority,
        ts_created:  t.ts_created  ? Math.floor(t.ts_created  / 1000) : null,
        ts_accepted: t.ts_accepted ? Math.floor(t.ts_accepted / 1000) : null,
        ts_arrived:  t.ts_arrived  ? Math.floor(t.ts_arrived  / 1000) : null,
        ts_fixed:    t.ts_fixed    ? Math.floor(t.ts_fixed    / 1000) : null,
        ts_closed:   t.ts_closed   ? Math.floor(t.ts_closed   / 1000) : null,
        duration_min: t.ts_fixed && t.ts_created
          ? Math.round((t.ts_fixed - t.ts_created) / 60000) : null,
      }));
    },

    getSensors() {
      return sensors.map(s => ({
        ...s,
        label: s.display_name,
        status: s.current_state,
        statusColor: sensorStatus(s.current_state),
        last_seen_str: fmtRelTime(s.last_seen),
      }));
    },

    getSensorDetail(id) {
      const s = sensors.find(x => x.sensor_id === id || x.id === id);
      if (!s) return null;
      return {
        ...s,
        label: s.display_name,
        status: s.current_state,
        statusColor: sensorStatus(s.current_state),
        last_seen_str: fmtRelTime(s.last_seen),
        history: [
          { ts: Math.floor((Date.now() - 5 * 60000) / 1000), current_state: s.current_state, level_pct: s.level_pct, distance_mm: s.distance_mm },
          { ts: Math.floor((Date.now() - 65 * 60000) / 1000), current_state: s.last_state, level_pct: Math.min(100, (s.level_pct || 0) + 14), distance_mm: Math.max(0, (s.distance_mm || 0) - 16) },
        ],
        usage: sensorUsage.filter(row => row.sensor_id === s.sensor_id),
      };
    },

    getSensorUsage(sensorId='') {
      return sensorId
        ? sensorUsage.filter(row => row.sensor_id === sensorId)
        : sensorUsage.slice();
    },

    addAsset(formData) {
      return {
        zip_base64: 'MOCK_ZIP_DATA',
        thing_name: `iot_ops_${(formData.site||'site').toLowerCase()}_asset_${(formData.asset_id||'').toLowerCase()}`,
        cert_arn: 'arn:aws:iot:eu-central-1:123456789012:cert/MOCK-' + Date.now(),
      };
    },

    addStaff(formData) {
      return {
        zip_base64: 'MOCK_ZIP_DATA',
        thing_name: `iot_ops_staff_${formData.card_id||'card'}`,
        cert_arn: 'arn:aws:iot:eu-central-1:123456789012:cert/MOCK-' + Date.now(),
      };
    },

    addSensor(formData) {
      const sensor = {
        id: formData.sensor_id,
        sensor_id: formData.sensor_id,
        display_name: formData.display_name || formData.sensor_id,
        gateway_id: formData.gateway_id || '',
        mac: (formData.mac || '').toLowerCase(),
        product_type: formData.product_type || '',
        site: formData.site || 'facility-01',
        facility: formData.facility || '',
        building: formData.building || '',
        floor: formData.floor || '',
        location_label: formData.location_label || '',
        current_state: 'unknown',
        last_state: 'unknown',
        level_pct: null,
        distance_mm: null,
        dist_full: formData.dist_full ?? null,
        dist_empty: formData.dist_empty ?? null,
        refill_threshold: formData.refill_threshold ?? null,
        empty_confirm_needed: formData.empty_confirm_needed ?? null,
        publish_mode: formData.publish_mode || 'on_change',
        assigned_card_id: formData.assigned_card_id || 'card001',
        last_seen: 0,
        open_task_id: '',
        usage_count: 0,
      };
      sensors.push(sensor);
      return this.getSensorDetail(sensor.sensor_id);
    },

    updateSensorConfig(sensorId, formData) {
      const sensor = sensors.find(x => x.sensor_id === sensorId || x.id === sensorId);
      if (!sensor) throw new Error('Sensor bulunamadı');
      
      const newId = (formData.sensor_id || '').trim();
      if (newId && newId !== sensor.sensor_id) {
        const conflict = sensors.find(x => x.sensor_id === newId || x.id === newId);
        if (conflict) throw new Error('Bu sensör ID zaten mevcut');
        sensor.sensor_id = newId;
        sensor.id = newId;
      }
      
      sensor.display_name = formData.display_name || sensor.display_name;
      sensor.product_type = formData.product_type || sensor.product_type;
      sensor.facility = formData.facility ?? sensor.facility;
      sensor.building = formData.building ?? sensor.building;
      sensor.floor = formData.floor ?? sensor.floor;
      sensor.zone = formData.zone ?? sensor.zone;
      sensor.location_label = formData.location_label || sensor.location_label;
      sensor.assigned_card_id = formData.assigned_card_id || sensor.assigned_card_id;
      sensor.dist_full = formData.dist_full ?? sensor.dist_full;
      sensor.dist_empty = formData.dist_empty ?? sensor.dist_empty;
      sensor.refill_threshold = formData.refill_threshold ?? sensor.refill_threshold;
      sensor.empty_confirm_needed = formData.empty_confirm_needed ?? sensor.empty_confirm_needed;
      sensor.publish_mode = formData.publish_mode || sensor.publish_mode;
      const commandId = 'CMD-MOCK-' + Date.now();
      const queuedCommand = {
        command_id: commandId,
        gateway_id: sensor.gateway_id,
        sensor_id: sensor.sensor_id,
        status: 'pending',
      };
      return {
        sensor: this.getSensorDetail(sensor.sensor_id),
        queued_command: queuedCommand,
        queued_commands: [queuedCommand],
        mqtt_publish: sensor.gateway_id
          ? { command_id: commandId, topic: `mock/${sensor.gateway_id}/command`, status: 'published' }
          : { command_id: commandId, status: 'skipped', reason: 'missing_gateway_id' },
      };
    },

    fmtRelTime, fmtDt, calcMin, taskBadge, elevStatus, sensorStatus, staffStatus,
  };
})();

} // end MOCK_MODE guard

