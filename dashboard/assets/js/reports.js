/* ============================================================
   EDGE-OPS AI — reports.js
   Birleştirilmiş Analiz & Raporlar Logic'i (Endüstriyel Varlık + WC)
   ============================================================ */
'use strict';

Auth.guardPage();
Auth.applyRoleUI();

/* ── Kullanıcı avatar & Saat & Logout ────────────────────── */
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

/* ── State ve Değişkenler ────────────────────────────────── */
let activeTab = 'Asset'; // Asset, restroom
let activePeriod = 'week';   // week, month, quarter
let taskSearch = '';
let charts = {};

let allAssetTasks = [];
let allRestroomTasks = [];
let allSensorUsage = [];
let elevMap = {};

/* ── Tab Switcher Logic ──────────────────────────────────── */
const tabAsset = document.getElementById('tabAsset');
const tabRestroom = document.getElementById('tabRestroom');

if (tabAsset) {
  tabAsset.addEventListener('click', () => switchTab('Asset'));
}
if (tabRestroom) {
  tabRestroom.addEventListener('click', () => switchTab('restroom'));
}

function switchTab(tab) {
  activeTab = tab;
  
  if (tabAsset) {
    tabAsset.classList.toggle('active', activeTab === 'Asset');
  }
  if (tabRestroom) {
    tabRestroom.classList.toggle('active', activeTab === 'restroom');
  }

  // Element Görünürlükleri
  document.querySelectorAll('.sec-Asset').forEach(el => {
    el.style.display = activeTab === 'Asset' ? '' : 'none';
  });
  document.querySelectorAll('.sec-restroom').forEach(el => {
    el.style.display = activeTab === 'restroom' ? '' : 'none';
  });

  // Tablo Başlığı
  const tableTitle = document.getElementById('tableTitle');
  if (tableTitle) {
    tableTitle.textContent = activeTab === 'Asset' ? 'Endüstriyel Varlık Görev Listesi' : 'WC Sensör Görev Listesi';
  }

  renderAll();
}

/* ── Grafik Temizleme ────────────────────────────────────── */
function destroyCharts() {
  Object.keys(charts).forEach(key => {
    if (charts[key]) {
      charts[key].destroy();
      delete charts[key];
    }
  });
}

/* ── Chart.js Seçenekleri ────────────────────────────── */
const TICK_STYLE = { font: { family: "'Inter', sans-serif", size: 11, weight: '500' }, color: '#64748B' };
const GRID_STYLE = { color: '#E2E8F0', borderDash: [5, 5], drawTicks: false };
const TOOLTIP_STYLE = {
  backgroundColor: '#1E293B',
  titleFont: { family: "'Inter', sans-serif", size: 12, weight: '600' },
  bodyFont: { family: "'Inter', sans-serif", size: 12 },
  padding: 10,
  cornerRadius: 6,
  displayColors: true
};

/* ============================================================
   Endüstriyel Varlık GRAFİKLERİ ÇİZİMİ
   ============================================================ */
function drawAssetCharts(tasks, monthlyData) {
  // 1. Aylık Bar Grafik
  const monthlyCanvas = document.getElementById('monthlyChart');
  if (monthlyCanvas && monthlyData) {
    const ctx = monthlyCanvas.getContext('2d');
    
    // Gradient tanımları
    const gradFault = ctx.createLinearGradient(0, 0, 0, 220);
    gradFault.addColorStop(0, 'rgba(239, 68, 68, 0.85)');
    gradFault.addColorStop(1, 'rgba(239, 68, 68, 0.15)');

    const gradResolved = ctx.createLinearGradient(0, 0, 0, 220);
    gradResolved.addColorStop(0, 'rgba(34, 197, 94, 0.85)');
    gradResolved.addColorStop(1, 'rgba(34, 197, 94, 0.15)');

    charts.monthly = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: monthlyData.labels,
        datasets: [
          { label: 'Arıza',   data: monthlyData.faults,   backgroundColor: gradFault,  borderRadius: 6 },
          { label: 'Çözüldü', data: monthlyData.resolved, backgroundColor: gradResolved,  borderRadius: 6 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { 
          legend: { position: 'top', labels: { boxWidth: 10, font: { family: "'Inter', sans-serif", weight: '500' } } },
          tooltip: TOOLTIP_STYLE
        },
        scales: {
          x: { grid: { display: false }, ticks: TICK_STYLE },
          y: { grid: GRID_STYLE, ticks: { ...TICK_STYLE, stepSize: 2 }, beginAtZero: true },
        },
      },
    });
  }

  // 2. Arıza Tipi Doughnut
  const doughnutCanvas = document.getElementById('doughnutChart');
  if (doughnutCanvas) {
    const counts = {};
    tasks.forEach(t => {
      const key = t.fault_type || 'Diğer';
      counts[key] = (counts[key] || 0) + 1;
    });
    const labels = Object.keys(counts);
    const values = Object.values(counts);
    const COLORS = ['#6366F1','#EF4444','#F59E0B','#22C55E','#3B82F6','#8B5CF6','#EC4899'];

    const ctx = doughnutCanvas.getContext('2d');
    charts.doughnut = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels.length ? labels : ['Kayıt Yok'],
        datasets: [{
          data: values.length ? values : [0],
          backgroundColor: COLORS.slice(0, Math.max(labels.length, 1)),
          borderWidth: 0,
          borderColor: '#fff',
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { 
          legend: { position: 'right', labels: { boxWidth: 10, padding: 12, font: { family: "'Inter', sans-serif", size: 10 } } },
          tooltip: TOOLTIP_STYLE
        },
        cutout: '70%',
      },
    });
  }

  // 3. Müdahale Süresi Bar
  const responseCanvas = document.getElementById('responseTimeChart');
  if (responseCanvas) {
    const buckets = { '0–15 dk': 0, '15–30 dk': 0, '30–60 dk': 0, '60+ dk': 0 };
    tasks.forEach(t => {
      const m = t.total_min;
      if (m == null) return;
      if (m <= 15)       buckets['0–15 dk']++;
      else if (m <= 30)  buckets['15–30 dk']++;
      else if (m <= 60)  buckets['30–60 dk']++;
      else               buckets['60+ dk']++;
    });

    const ctx = responseCanvas.getContext('2d');
    charts.responseTime = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: Object.keys(buckets),
        datasets: [{
          data: Object.values(buckets),
          backgroundColor: ['#10B981','#6366F1','#F59E0B','#EF4444'],
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { 
          legend: { display: false },
          tooltip: TOOLTIP_STYLE
        },
        scales: {
          x: { grid: { display: false }, ticks: TICK_STYLE },
          y: { grid: GRID_STYLE, ticks: { ...TICK_STYLE, stepSize: 1 }, beginAtZero: true },
        },
      },
    });
  }

  // 4. Günlük Görev Yoğunluğu
  const dailyCanvas = document.getElementById('dailyChart');
  if (dailyCanvas) {
    const days = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'];
    const counts = new Array(7).fill(0);
    tasks.forEach(t => {
      if (!t._ts_created) return;
      const d = new Date(t._ts_created).getDay(); // 0=Sun
      const idx = d === 0 ? 6 : d - 1;
      counts[idx]++;
    });

    const ctx = dailyCanvas.getContext('2d');
    const gradDaily = ctx.createLinearGradient(0, 0, 0, 200);
    gradDaily.addColorStop(0, 'rgba(99, 102, 241, 0.85)');
    gradDaily.addColorStop(1, 'rgba(99, 102, 241, 0.15)');

    charts.daily = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: days,
        datasets: [{
          data: counts,
          backgroundColor: gradDaily,
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { 
          legend: { display: false },
          tooltip: TOOLTIP_STYLE
        },
        scales: {
          x: { grid: { display: false }, ticks: TICK_STYLE },
          y: { grid: GRID_STYLE, ticks: { ...TICK_STYLE, stepSize: 1 }, beginAtZero: true },
        },
      },
    });
  }
}

/* ============================================================
   RESTROOM GRAFİKLERİ ÇİZİMİ
   ============================================================ */
function drawRestroomCharts(tasks, sensorUsage) {
  // 1. Aylık Görev / Tamamlama Bar Grafik (Son 6 ay)
  const monthlyCanvas = document.getElementById('restroomMonthlyChart');
  if (monthlyCanvas) {
    const monthNames = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
    const last6Months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      last6Months.push({ monthIndex: d.getMonth(), name: monthNames[d.getMonth()], tasks: 0, completed: 0 });
    }

    tasks.forEach(t => {
      const createdMs = t._ts_created;
      if (!createdMs) return;
      const tDate = new Date(createdMs);
      const mIdx = tDate.getMonth();
      const bucket = last6Months.find(b => b.monthIndex === mIdx);
      if (bucket) {
        bucket.tasks++;
        if (t.status_raw === 'completed' || t.status_raw === 'closed') {
          bucket.completed++;
        }
      }
    });

    const ctx = monthlyCanvas.getContext('2d');
    
    const gradTasks = ctx.createLinearGradient(0, 0, 0, 220);
    gradTasks.addColorStop(0, 'rgba(14, 165, 233, 0.85)');
    gradTasks.addColorStop(1, 'rgba(14, 165, 233, 0.15)');

    const gradCompleted = ctx.createLinearGradient(0, 0, 0, 220);
    gradCompleted.addColorStop(0, 'rgba(99, 102, 241, 0.85)');
    gradCompleted.addColorStop(1, 'rgba(99, 102, 241, 0.15)');

    charts.restroomMonthly = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: last6Months.map(b => b.name),
        datasets: [
          { label: 'Görev', data: last6Months.map(b => b.tasks), backgroundColor: gradTasks, borderRadius: 6 },
          { label: 'Tamamlanan', data: last6Months.map(b => b.completed), backgroundColor: gradCompleted, borderRadius: 6 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { 
          legend: { position: 'top', labels: { boxWidth: 10, font: { family: "'Inter', sans-serif", weight: '500' } } },
          tooltip: TOOLTIP_STYLE
        },
        scales: {
          x: { grid: { display: false }, ticks: TICK_STYLE },
          y: { grid: GRID_STYLE, ticks: { ...TICK_STYLE, stepSize: 1 }, beginAtZero: true },
        },
      },
    });
  }

  // 2. Görev Tipi Dağılımı Doughnut
  const typeCanvas = document.getElementById('restroomTypeChart');
  if (typeCanvas) {
    const counts = {};
    tasks.forEach(t => {
      const key = t.fault_type || 'Diğer';
      counts[key] = (counts[key] || 0) + 1;
    });
    const labels = Object.keys(counts);
    const values = Object.values(counts);
    const COLORS = ['#3B82F6','#10B981','#EF4444','#F59E0B','#8B5CF6','#94A3B8'];

    const ctx = typeCanvas.getContext('2d');
    charts.restroomType = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels.length ? labels : ['Kayıt Yok'],
        datasets: [{
          data: values.length ? values : [0],
          backgroundColor: COLORS.slice(0, Math.max(labels.length, 1)),
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '70%',
        plugins: { 
          legend: { position: 'right', labels: { boxWidth: 10, padding: 12, font: { family: "'Inter', sans-serif", size: 10 } } },
          tooltip: TOOLTIP_STYLE
        },
      },
    });
  }

  // 3. WC Başına Görev Sayısı Horizontal Bar (Top 6)
  const wcCanvas = document.getElementById('restroomWcChart');
  if (wcCanvas) {
    const wcCounts = {};
    tasks.forEach(t => {
      const loc = t.asset_name || 'Bilinmeyen WC';
      wcCounts[loc] = (wcCounts[loc] || 0) + 1;
    });
    const sortedWcs = Object.entries(wcCounts).sort((a,b) => b[1] - a[1]).slice(0, 6);

    const ctx = wcCanvas.getContext('2d');
    charts.restroomWc = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: sortedWcs.map(w => w[0]),
        datasets: [{
          data: sortedWcs.map(w => w[1]),
          backgroundColor: ['#EF4444','#F59E0B','#6366F1','#10B981','#EC4899','#94A3B8'],
          borderRadius: 6,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: { 
          legend: { display: false },
          tooltip: TOOLTIP_STYLE
        },
        scales: {
          x: { grid: GRID_STYLE, ticks: { ...TICK_STYLE, stepSize: 1 } },
          y: { grid: { display: false }, ticks: TICK_STYLE },
        },
      },
    });
  }

  // 4. Haftalık Ortalama Çözüm Süresi Line Chart (Son 8 hafta)
  const slaCanvas = document.getElementById('restroomSlaChart');
  if (slaCanvas) {
    const weeklyAvgTime = [];
    const weekLabels = [];
    if (tasks.length > 0) {
      const now = Date.now();
      for (let i = 7; i >= 0; i--) {
        const limitMin = now - (i + 1) * 7 * 24 * 60 * 60 * 1000;
        const limitMax = now - i * 7 * 24 * 60 * 60 * 1000;
        
        const weekTasks = tasks.filter(t => t._ts_created >= limitMin && t._ts_created < limitMax);
        const doneWeekTasks = weekTasks.filter(t => ['completed', 'closed'].includes(t.status_raw) && t.total_min != null);
        
        let avgTime = 0;
        if (doneWeekTasks.length > 0) {
          const sumTime = doneWeekTasks.reduce((acc, t) => acc + t.total_min, 0);
          avgTime = Math.round(sumTime / doneWeekTasks.length);
        } else {
          avgTime = 0;
        }
        
        weeklyAvgTime.push(avgTime);
        weekLabels.push(`W-${i}`);
      }
    }

    const ctx = slaCanvas.getContext('2d');
    const gradTime = ctx.createLinearGradient(0, 0, 0, 200);
    gradTime.addColorStop(0, 'rgba(99, 102, 241, 0.25)');
    gradTime.addColorStop(1, 'rgba(99, 102, 241, 0.0)');

    charts.restroomSla = new Chart(ctx, {
      type: 'line',
      data: {
        labels: weekLabels,
        datasets: [{
          label: 'Ort. Çözüm Süresi (dk)',
          data: weeklyAvgTime,
          borderColor: '#6366F1',
          backgroundColor: gradTime,
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: '#6366F1',
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { 
          legend: { display: false },
          tooltip: TOOLTIP_STYLE
        },
        scales: {
          x: { grid: { display: false }, ticks: TICK_STYLE },
          y: { grid: GRID_STYLE, ticks: { ...TICK_STYLE, callback: v => v + ' dk' }, beginAtZero: true },
        },
      },
    });
  }

  // 5. Restroom Sensör Tüketim Yığılmış Bar Grafik (Stacked Bar)
  const sensorUsageCanvas = document.getElementById('sensorUsageChart');
  if (sensorUsageCanvas && sensorUsage) {
    const daysSet = new Set();
    const sensorsSet = new Set();
    sensorUsage.forEach(row => {
      if (row.day) daysSet.add(row.day);
      if (row.sensor_id) sensorsSet.add(row.sensor_id);
    });
    
    const labels = Array.from(daysSet).sort();
    const formattedLabels = labels.map(formatDateStr);
    const sensors = Array.from(sensorsSet).sort();
    
    const datasets = sensors.map((sensorId, idx) => {
      const COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#8B5CF6'];
      const data = labels.map(day => {
        const row = sensorUsage.find(r => r.day === day && r.sensor_id === sensorId);
        return row ? Number(row.usage_count || 0) : 0;
      });
      
      return {
        label: sensorId,
        data: data,
        backgroundColor: COLORS[idx % COLORS.length],
        borderRadius: 4
      };
    });

    const ctx = sensorUsageCanvas.getContext('2d');
    charts.sensorUsage = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: formattedLabels.length ? formattedLabels : ['Veri Yok'],
        datasets: datasets.length ? datasets : [{ label: 'Kullanım', data: [0], backgroundColor: '#E2E8F0' }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { 
          legend: { position: 'top', labels: { boxWidth: 10, font: { family: "'Inter', sans-serif", weight: '500' } } },
          tooltip: TOOLTIP_STYLE
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: TICK_STYLE },
          y: { stacked: true, grid: GRID_STYLE, ticks: TICK_STYLE, beginAtZero: true },
        },
      },
    });
  }
}

/* ============================================================
   KPI DEĞERLERİNİ HESAPLAMA VE YAZMA
   ============================================================ */
function calculateAndRenderKPIs() {
  if (activeTab === 'Asset') {
    const total    = allAssetTasks.length;
    const resolved = allAssetTasks.filter(t => t.status_raw === 'completed' || t.status_raw === 'closed').length;
    const open     = allAssetTasks.filter(t => ['assigned', 'accepted', 'in_progress', 'arrived'].includes(t.status_raw)).length;
    const times    = allAssetTasks.map(t => t.total_min).filter(m => m != null);
    const avg      = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;

    document.getElementById('rKpiTotal').textContent    = total;
    document.getElementById('rKpiResolved').textContent = resolved;
    document.getElementById('rKpiAvgTime').textContent  = avg != null ? avg + ' dk' : '—';
    document.getElementById('rKpiOpen').textContent     = open;
  } else {
    const total = allRestroomTasks.length;
    const doneTasks = allRestroomTasks.filter(t => ['completed', 'closed'].includes(t.status_raw));
    const done = doneTasks.length;

    // Ortalama yanıt/müdahale süresi
    let totalResponseMin = 0;
    let responseCount = 0;
    allRestroomTasks.forEach(t => {
      const created = t._ts_created;
      const accepted = t._ts_accepted || t._ts_fixed;
      if (created && accepted && accepted >= created) {
        totalResponseMin += (accepted - created) / 60000;
        responseCount++;
      }
    });
    const avgResponse = responseCount > 0 ? Math.round(totalResponseMin / responseCount) : null;

    // SLA Uyum Oranı: Süresi 20 dk'dan az olan tamamlanan görevler
    let sla = null;
    if (total > 0) {
      let slaCompliant = 0;
      doneTasks.forEach(t => {
        if (t.total_min != null && t.total_min <= 20) slaCompliant++;
        else if (t.total_min == null) slaCompliant++; 
      });
      sla = Math.round((slaCompliant / total) * 100);
    }

    document.getElementById('rrKpiTotal').textContent = total;
    document.getElementById('rrKpiDone').textContent = done;
    document.getElementById('rrKpiAvgResponse').textContent = avgResponse != null ? avgResponse + ' dk' : '—';
    document.getElementById('rrKpiSla').textContent = sla != null ? '%' + sla : '—';
  }
}

/* ============================================================
   TABLO VE TABLO BAŞLIKLARINI RENDER ETME
   ============================================================ */
function renderTableHeader() {
  const header = document.getElementById('taskTableHeader');
  if (!header) return;
  if (activeTab === 'Asset') {
    header.innerHTML = `
      <tr>
        <th>Task ID</th>
        <th>Endüstriyel Varlık</th>
        <th>Arıza Tipi</th>
        <th>Personel</th>
        <th>Oluşturma</th>
        <th>Çözüm</th>
        <th>Süre</th>
        <th>Durum</th>
      </tr>`;
  } else {
    header.innerHTML = `
      <tr>
        <th>Task ID</th>
        <th>Konum / Sensör</th>
        <th>Görev Tipi</th>
        <th>Personel</th>
        <th>Oluşturma</th>
        <th>Süre (Çözüm)</th>
        <th>Durum</th>
      </tr>`;
  }
}

function renderTableRows() {
  const tbody = document.getElementById('taskTableBody');
  if (!tbody) return;

  let list = activeTab === 'Asset' ? allAssetTasks : allRestroomTasks;

  if (taskSearch) {
    const q = taskSearch.toLowerCase();
    list = list.filter(t =>
      (t.id             || '').toLowerCase().includes(q) ||
      (t.asset_name     || '').toLowerCase().includes(q) ||
      (t.fault_type     || '').toLowerCase().includes(q) ||
      (t.assigned_to_name || '').toLowerCase().includes(q)
    );
  }

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="${activeTab === 'Asset' ? 8 : 7}" style="text-align:center;padding:24px;color:var(--text-muted);">Görev bulunamadı.</td></tr>`;
    return;
  }

  if (activeTab === 'Asset') {
    tbody.innerHTML = list.map(t => `
      <tr>
        <td class="mono" style="font-size:.72rem">${t.id}</td>
        <td><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align: -2px; margin-right: 6px; display: inline-block; color: #10b981;"><rect x="5" y="2" width="14" height="20" rx="2"/></svg>${t.asset_name || '—'}</td>
        <td>${t.fault_type || '—'}</td>
        <td>${t.assigned_to_name || '—'}</td>
        <td style="font-size:.75rem;color:var(--text-secondary);">${t.ts_created || '—'}</td>
        <td style="font-size:.75rem;color:var(--text-secondary);">${t.ts_fixed   || '—'}</td>
        <td>${t.total_min != null ? t.total_min + ' dk' : '—'}</td>
        <td><span class="badge ${t.status ? t.status.cls : 'badge-gray'}">${t.status ? t.status.label : '—'}</span></td>
      </tr>`).join('');
  } else {
    tbody.innerHTML = list.map(t => `
      <tr>
        <td class="mono" style="font-size:.72rem">${t.id}</td>
        <td><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align: -2px; margin-right: 6px; display: inline-block; color: #6366f1;"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4"/></svg>${t.asset_name || '—'}</td>
        <td>${t.fault_type || '—'}</td>
        <td>${t.assigned_to_name || '—'}</td>
        <td style="font-size:.75rem;color:var(--text-secondary);">${t.ts_created || '—'}</td>
        <td>${t.total_min != null ? t.total_min + ' dk' : '—'}</td>
        <td><span class="badge ${t.status ? t.status.cls : 'badge-gray'}">${t.status ? t.status.label : '—'}</span></td>
      </tr>`).join('');
  }
}

function formatDateStr(dayStr) {
  if (!dayStr) return '—';
  const s = String(dayStr);
  if (s.length !== 8) return s;
  const yyyy = s.substring(0, 4);
  const mm = s.substring(4, 6);
  const dd = s.substring(6, 8);
  const months = {
    '01': 'Oca', '02': 'Şub', '03': 'Mar', '04': 'Nis',
    '05': 'May', '06': 'Haz', '07': 'Tem', '08': 'Ağu',
    '09': 'Eyl', '10': 'Eki', '11': 'Kas', '12': 'Ara'
  };
  return `${dd} ${months[mm] || mm} ${yyyy}`;
}

function renderSensorUsageTable() {
  const tbody = document.getElementById('sensorUsageBody');
  if (!tbody) return;
  if (!allSensorUsage.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">Kullanım kaydı yok.</td></tr>';
    return;
  }
  tbody.innerHTML = allSensorUsage.slice(0, 12).map(row => `
    <tr>
      <td>${row.sensor_id || '—'}</td>
      <td class="mono">${formatDateStr(row.day)}</td>
      <td>${row.usage_count ?? 0}</td>
      <td>${row.empty_count ?? 0}</td>
      <td>${row.refill_count ?? 0}</td>
    </tr>
  `).join('');
}

/* ============================================================
   DÖNEM DEĞİŞTİRME & ANA VERİ RENDER
   ============================================================ */
function renderAll() {
  calculateAndRenderKPIs();
  renderTableHeader();
  renderTableRows();
  renderSensorUsageTable();

  destroyCharts();

  if (activeTab === 'Asset') {
    // Aylık grafik barChartData mock özetinden gelir
    API.getSummary().then(summary => {
      drawAssetCharts(allAssetTasks, summary.barChartData);
    });
  } else {
    drawRestroomCharts(allRestroomTasks, allSensorUsage);
  }
}

document.getElementById('taskSearch').addEventListener('input', (e) => {
  taskSearch = e.target.value.trim();
  renderTableRows();
});

/* ── Dönem seçimi event listener'ları ──────────────────────── */
document.querySelectorAll('.period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activePeriod = btn.dataset.period;
    loadData();
  });
});

/* ── Ham API verisini UI formatına çevir ─────────────────── */
function normalizeTask(t) {
  const STATUS_MAP = {
    assigned:    { cls: 'badge-amber',  label: 'Devam Ediyor' },
    accepted:    { cls: 'badge-blue',   label: 'Devam Ediyor' },
    in_progress: { cls: 'badge-blue',   label: 'Devam Ediyor' },
    completed:   { cls: 'badge-green',  label: 'Çözüldü' },
    rejected:    { cls: 'badge-red',    label: 'Reddedildi' },
    timeout:     { cls: 'badge-red',    label: 'Zaman Aşımı' },
    open:        { cls: 'badge-amber',  label: 'Bekliyor' },
  };

  function toMs(v) {
    if (!v) return null;
    const n = parseInt(v);
    if (isNaN(n)) return null;
    return n > 1e12 ? n : n * 1000;
  }

  const tsCreated = toMs(t.ts_created);
  const tsFixed   = toMs(t.ts_fixed || t.ts_completed);
  const totalMin  = t.duration_min != null
    ? parseInt(t.duration_min)
    : (tsCreated && tsFixed ? Math.round((tsFixed - tsCreated) / 60000) : null);

  const assetName = t.location_label || t.asset_name || (t.asset_id ? (elevMap[t.asset_id] || t.asset_id) : '');
  const faultType = t.task_label || t.fault_type || 'Bildirim';
  const assignedToName = t.assigned_to ? (typeof t.assigned_to === 'object' ? t.assigned_to.name : t.assigned_to) : '—';

  return {
    ...t,
    asset_name:       assetName,
    fault_type:       faultType,
    assigned_to_name: assignedToName,
    total_min:        totalMin,
    status_raw:       t.status || 'open',
    _ts_created:      tsCreated,
    _ts_accepted:     toMs(t.ts_accepted),
    _ts_fixed:        tsFixed,
    ts_created: tsCreated ? new Date(tsCreated).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—',
    ts_fixed:   tsFixed   ? new Date(tsFixed).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—',
    status: STATUS_MAP[t.status] || { cls: 'badge-gray', label: t.status || '—' },
  };
}

/* ============================================================
   DATA LOADING (Endüstriyel Varlık + WC VERİ ÇEKİMİ)
   ============================================================ */
async function loadData() {
  try {
    // Tüm API isteklerini paralel olarak başlatalım
    const [Assets, rawElevTasks, sensorUsage] = await Promise.all([
      API.getAssets().catch(err => { console.warn('[Reports] getAssets error:', err); return []; }),
      API.getTasks().catch(err => { console.warn('[Reports] getTasks error:', err); return []; }),
      API.getSensorUsage().catch(err => { console.warn('[Reports] getSensorUsage error:', err); return []; })
    ]);

    elevMap = Object.fromEntries(Assets.map(e => [e.id, e.label || e.id]));

    // Dönem bazlı kesme
    const cutoffs = { week: 7, month: 30, quarter: 90 };
    const days    = cutoffs[activePeriod] || 30;
    const cutoff  = Date.now() - days * 86400000;

    // 1. Genel / Endüstriyel Varlık Görevleri
    allAssetTasks = rawElevTasks
      .map(normalizeTask)
      .filter(t => (!t._ts_created || t._ts_created >= cutoff));

    allRestroomTasks = [];

    // 3. Sensör Tüketim Bilgileri
    allSensorUsage = sensorUsage || [];

    // Render et
    renderAll();

  } catch (err) {
    console.error('[Reports] Veri yükleme hatası:', err);
  }
}

// Başlat
loadData();
// Her 30 saniyede bir canlandır
setInterval(loadData, 30000);

if (typeof Notify !== 'undefined' && Notify.init) {
  Notify.init();
}

/* ── Excel'e Aktarma İşlevi ──────────────────────────────── */
function exportToExcel() {
  if (typeof XLSX === 'undefined') {
    alert('Excel kütüphanesi yüklenemedi. Lütfen internet bağlantınızı kontrol edin.');
    return;
  }

  const wb = XLSX.utils.book_new();
  const tasks = activeTab === 'Asset' ? allAssetTasks : allRestroomTasks;
  
  // Hesaplamalar ve Genel İstatistikler
  const completedTasks = tasks.filter(t => t.status_raw === 'completed' || t.status_raw === 'closed');
  const completed = completedTasks.length;
  const openTasks = tasks.filter(t => ['assigned', 'accepted', 'in_progress', 'arrived', 'open'].includes(t.status_raw));
  const open = openTasks.length;
  const durations = tasks.filter(t => t.total_min != null).map(t => Number(t.total_min) || 0);
  const avgMin = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  
  const slaLimit = activeTab === 'Asset' ? 30 : 20; // Endüstriyel Varlık: 30 dk, WC: 20 dk SLA Limiti
  
  let slaCompliantCount = 0;
  completedTasks.forEach(t => {
    if (t.total_min != null) {
      if (t.total_min <= slaLimit) slaCompliantCount++;
    } else {
      slaCompliantCount++; // Süre bilgisi yoksa uyumlu kabul et
    }
  });
  
  const successRate = tasks.length > 0 ? Math.round((slaCompliantCount / tasks.length) * 100) : 100;

  // Yardımcı format fonksiyonları
  const formatDuration = (min) => {
    if (min == null || isNaN(min)) return '—';
    if (min < 60) return `${min} dk`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h} sa ${m} dk` : `${h} sa`;
  };

  const formatPeriod = (p) => {
    const map = { week: 'Bu Hafta (7 Gün)', month: 'Bu Ay (30 Gün)', quarter: 'Son 3 Ay (90 Gün)' };
    return map[p] || p;
  };

  const formatDateStr = (str) => {
    if (!str) return '—';
    try {
      const d = new Date(str);
      if (isNaN(d.getTime())) return str;
      return d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    } catch(e) {
      return str;
    }
  };

  // ── 1. GENEL ÖZET SAYFASI ──
  const summaryTitle = [
    ['EDGE-OPS AI — OPERASYONEL ANALİZ RAPORU'],
    ['Rapor Oluşturma Tarihi:', new Date().toLocaleString('tr-TR')],
    ['Zaman Aralığı (Filtre):', formatPeriod(activePeriod)],
    ['Veri Kaynağı Modu:', CONFIG.MOCK_MODE ? 'MOCK VERİ' : 'CANLI AWS API'],
    ['']
  ];

  const summaryKPIs = [
    ['GENEL PERFORMANS METRİKLERİ'],
    ['Metrik Açıklaması', 'Değer', 'Hedef / Limit'],
    ['Rapor Kategorisi', activeTab === 'Asset' ? 'Endüstriyel Varlık Bakım & Onarım' : 'WC & Sensör Yönetimi', '—'],
    ['Toplam Kayıtlı Olay/Görev', tasks.length, '—'],
    ['Çözülen / Kapatılan Görev', completed, '—'],
    ['Aktif / Açık Kalan Görev', open, '—'],
    ['SLA Müdahale Süre Sınırı', `${slaLimit} Dakika`, 'Maksimum Süre'],
    ['SLA Başarı Oranı (Zamanında Çözüm)', `%${successRate}`, '>= %85 Hedef'],
    ['Ortalama Çözüm / Müdahale Süresi', formatDuration(Math.round(avgMin)), '—'],
    ['']
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryTitle);
  XLSX.utils.sheet_add_aoa(wsSummary, summaryKPIs, { origin: 'A6' });

  let currentOffset = 17;

  // 1.1 Görev Tipi Dağılım Tablosu
  const typeCounts = {};
  tasks.forEach(t => {
    const key = t.fault_type || 'Diğer';
    typeCounts[key] = (typeCounts[key] || 0) + 1;
  });
  const typeRows = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => [type, count, `%${tasks.length ? Math.round((count / tasks.length) * 100) : 0}`]);

  XLSX.utils.sheet_add_aoa(wsSummary, [
    ['GÖREV VE ARIZA TİPİ DAĞILIMI'],
    ['Görev Tipi / Arıza Kategorisi', 'Adet (Frekans)', 'Yüzdesel Oran']
  ], { origin: `A${currentOffset}` });

  if (typeRows.length) {
    XLSX.utils.sheet_add_aoa(wsSummary, typeRows, { origin: `A${currentOffset + 2}` });
    currentOffset += typeRows.length + 4;
  } else {
    XLSX.utils.sheet_add_aoa(wsSummary, [['Kayıt bulunamadı', 0, '%0']], { origin: `A${currentOffset + 2}` });
    currentOffset += 5;
  }

  // 1.2 Personel Performans ve SLA Tablosu
  const staffStats = {};
  tasks.forEach(t => {
    const name = t.assigned_to_name || 'Atanmamış';
    if (!staffStats[name]) {
      staffStats[name] = { total: 0, completed: 0, open: 0, total_time: 0, time_count: 0, sla_ok: 0 };
    }
    staffStats[name].total++;
    if (t.status_raw === 'completed' || t.status_raw === 'closed') {
      staffStats[name].completed++;
      if (t.total_min != null && t.total_min <= slaLimit) {
        staffStats[name].sla_ok++;
      } else if (t.total_min == null) {
        staffStats[name].sla_ok++;
      }
    } else {
      staffStats[name].open++;
    }
    if (t.total_min != null) {
      staffStats[name].total_time += t.total_min;
      staffStats[name].time_count++;
    }
  });

  const staffRows = Object.entries(staffStats).map(([name, stats]) => {
    const avg = stats.time_count ? Math.round(stats.total_time / stats.time_count) : null;
    const slaPct = stats.total ? Math.round((stats.sla_ok / stats.total) * 100) : 100;
    return [
      name,
      stats.total,
      stats.completed,
      stats.open,
      avg != null ? formatDuration(avg) : '—',
      `%${slaPct}`
    ];
  });

  XLSX.utils.sheet_add_aoa(wsSummary, [
    ['TEKNİK EKİP VE PERSONEL PERFORMANS TABLOSU'],
    ['Personel Adı Soyadı', 'Toplam Atanan', 'Çözülen Görev', 'Aktif Görev', 'Ortalama Çözüm Süresi', 'SLA Başarı Oranı']
  ], { origin: `A${currentOffset}` });

  if (staffRows.length) {
    XLSX.utils.sheet_add_aoa(wsSummary, staffRows, { origin: `A${currentOffset + 2}` });
    currentOffset += staffRows.length + 4;
  } else {
    XLSX.utils.sheet_add_aoa(wsSummary, [['Kayıt bulunamadı', 0, 0, 0, '—', '%100']], { origin: `A${currentOffset + 2}` });
    currentOffset += 5;
  }

  // 1.3 En Sık Hata Oluşan En Sıkıntılı Varlıklar (Top 5)
  const assetCounts = {};
  tasks.forEach(t => {
    const key = t.asset_name || t.asset_id || 'Bilinmeyen Varlık';
    assetCounts[key] = (assetCounts[key] || 0) + 1;
  });
  const assetRows = Object.entries(assetCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([asset, count]) => [asset, count]);

  XLSX.utils.sheet_add_aoa(wsSummary, [
    ['EN ÇOK GÖREV OLUŞAN VARLIKLAR / LOKASYONLAR (TOP 5)'],
    ['Varlık / Konum Adı', 'Arıza / Olay Adedi']
  ], { origin: `A${currentOffset}` });

  if (assetRows.length) {
    XLSX.utils.sheet_add_aoa(wsSummary, assetRows, { origin: `A${currentOffset + 2}` });
  } else {
    XLSX.utils.sheet_add_aoa(wsSummary, [['Kayıt bulunamadı', 0]], { origin: `A${currentOffset + 2}` });
  }

  wsSummary['!cols'] = [
    { wch: 36 }, { wch: 28 }, { wch: 20 }, { wch: 16 }, { wch: 24 }, { wch: 18 }
  ];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Genel Rapor Özeti');

  // ── 2. GÖREV DETAYLARI SAYFASI ──
  const detailRows = tasks.map(t => {
    const tsAccepted = t._ts_accepted ? new Date(t._ts_accepted).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
    
    // SLA Durumu metinsel analizi
    let slaStatus = '—';
    if (t.status_raw === 'completed' || t.status_raw === 'closed') {
      if (t.total_min != null) {
        if (t.total_min <= slaLimit) {
          slaStatus = 'Uyumlu (SLA İçi)';
        } else {
          slaStatus = `Aşıldı (${t.total_min - slaLimit} dk limit aşımı)`;
        }
      } else {
        slaStatus = 'Uyumlu (SLA İçi)';
      }
    } else {
      slaStatus = 'Devam Ediyor / Süreç İçi';
    }

    return {
      'Görev ID': t.id || '—',
      'Cihaz / Varlık ID': t.asset_id || '—',
      'Konum / Varlık Adı': t.asset_name || '—',
      'Görev / Hata Tipi': t.fault_type || '—',
      'Atanan Personel': t.assigned_to_name || '—',
      'Oluşturulma Tarihi': t.ts_created || '—',
      'Kabul Edilme Tarihi': tsAccepted,
      'Çözülme / Kapanış Tarihi': t.ts_fixed || '—',
      'Net Süre (Dakika)': t.total_min != null ? t.total_min : '—',
      'Anlaşılır Çözüm Süresi': formatDuration(t.total_min),
      'SLA Hedefi (Dk)': slaLimit,
      'SLA Uyum Durumu': slaStatus,
      'Görev Durumu': t.status ? t.status.label : (t.status_raw || '—'),
    };
  });

  const wsDetail = XLSX.utils.json_to_sheet(detailRows);
  wsDetail['!cols'] = [
    { wch: 18 }, { wch: 28 }, { wch: 32 }, { wch: 24 }, { wch: 20 }, 
    { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 20 }, { wch: 24 }, 
    { wch: 16 }, { wch: 26 }, { wch: 16 }
  ];
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Görev Detayları');

  // ── 3. SENSÖR TÜKETİM VERİLERİ (WC Aktifse) ──
  if (activeTab === 'restroom') {
    const usageRows = (allSensorUsage || []).map(row => ({
      'Sensör / Cihaz ID': row.sensor_id || '—',
      'Tüketim Tarihi': row.day ? new Date(row.day).toLocaleDateString('tr-TR') : '—',
      'Günlük Kullanım Sayısı': row.usage_count ?? 0,
      'Boşalma / Tüketim Olayı': row.empty_count ?? 0,
      'Dolum / Refill Sayısı': row.refill_count ?? 0,
      'Toplam Seviye Düşüşü (mm)': row.level_drop_total ?? 0,
    }));
    const wsUsage = XLSX.utils.json_to_sheet(usageRows);
    wsUsage['!cols'] = [{ wch: 26 }, { wch: 20 }, { wch: 24 }, { wch: 24 }, { wch: 22 }, { wch: 26 }];
    XLSX.utils.book_append_sheet(wb, wsUsage, 'Sensör Tüketim Verileri');
  }

  XLSX.writeFile(wb, `EDGE-OPS_Rapor_${activeTab}_${activePeriod}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

const exportBtn = document.getElementById('exportExcelBtn');
if (exportBtn) {
  exportBtn.addEventListener('click', exportToExcel);
}

