/* ============================================================
   EDGE-OPS AI — timeline.js
   Zaman çizelgesi, tüm görevler listesi ve detayları
   ============================================================ */
'use strict';

Auth.guardPage();
Auth.applyRoleUI();

/* ── Saat ────────────────────────────────────────────────── */
function updateClock() {
  const el = document.getElementById('clock');
  if (el) el.textContent = new Date().toLocaleTimeString('tr-TR');
}
updateClock();
setInterval(updateClock, 1000);

/* ── Logout ──────────────────────────────────────────────── */
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) logoutBtn.addEventListener('click', e => { e.preventDefault(); Auth.logout(); });

/* ── Avatar ──────────────────────────────────────────────── */
(function () {
  const user = Auth.getCurrentUser();
  const av = document.getElementById('userAvatar');
  if (user && av) av.textContent = (user.name || '').slice(0, 2).toUpperCase();
})();

/* ── Yardımcı Fonksiyonlar ───────────────────────────────── */
function toMs(v) {
  if (!v) return null;
  const n = parseInt(v);
  if (isNaN(n)) return null;
  return n > 1e12 ? n : n * 1000;
}

function fmtDateTime(ms) {
  if (!ms) return null;
  return new Date(ms).toLocaleString('tr-TR', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

function diffMin(msA, msB) {
  if (!msA || !msB) return null;
  return Math.round(Math.abs(msB - msA) / 60000);
}

function isToday(date) {
  const today = new Date();
  return date.getDate() === today.getDate() &&
         date.getMonth() === today.getMonth() &&
         date.getFullYear() === today.getFullYear();
}

function isYesterday(date) {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return date.getDate() === y.getDate() &&
         date.getMonth() === y.getMonth() &&
         date.getFullYear() === y.getFullYear();
}

function getVisibleStaff(staff) {
  const list = staff || [];
  const cardStaff = list.filter(s => (s.client_type || 'card') !== 'mobile');
  return (cardStaff.length ? cardStaff : list).slice(0, 1);
}

/* ── Durum ve Adım Tanımları ─────────────────────────────── */
const STEPS = [
  { key: '_ts_created',  label: 'Arıza Bildirildi',       desc: 'Sistem anomaliyi tespit etti, görev oluşturuldu', dotCls: 'red' },
  { key: '_ts_accepted', label: 'Personel Görevi Kabul',  desc: 'Atanan teknisyen görevi onayladı',                dotCls: 'blue' },
  { key: '_ts_arrived',  label: 'Konuma Varıldı',         desc: 'Teknisyen Endüstriyel Varlık lokasyonuna ulaştı',            dotCls: 'amber' },
  { key: '_ts_fixed',    label: 'Sorun Çözüldü',           desc: 'Arıza giderildi, test yapıldı',                   dotCls: 'green' },
  { key: '_ts_closed',   label: 'Görev Tamamlandı',       desc: 'Görev başarıyla tamamlandı, Endüstriyel Varlık operasyonel', dotCls: 'green' },
];

const STATUS_MAP = {
  completed: { cls: 'badge-green', label: 'Çözüldü' },
  assigned:  { cls: 'badge-amber', label: 'Devam Ediyor' },
  in_progress:{ cls: 'badge-blue', label: 'İşlemde' },
  arrived:   { cls: 'badge-amber', label: 'Müdahalede' },
  rejected:  { cls: 'badge-red',   label: 'Reddedildi' },
  timeout:   { cls: 'badge-red',   label: 'Zaman Aşımı' },
  open:      { cls: 'badge-amber', label: 'Bekliyor' },
};

function isSensorTask(task) {
  return !!task?.is_sensor;
}

function taskDisplayName(task) {
  return task?.asset_name || task?.asset_id || '—';
}

function timelineStepsFor(task) {
  if (!isSensorTask(task)) return STEPS;
  return [
    { key: '_ts_created',  label: 'Sensör Boşaldı',       desc: 'Sensör boş durumuna geçti ve görev oluşturuldu', dotCls: 'red' },
    { key: '_ts_accepted', label: 'Personel Görevi Kabul', desc: 'Atanan personel sensör görevini kabul etti',      dotCls: 'blue' },
    { key: '_ts_fixed',    label: 'Sensör Doldu',          desc: 'Sensör tekrar dolu algılandı',                   dotCls: 'green' },
    { key: '_ts_closed',   label: 'Görev Tamamlandı',     desc: 'Açık görev otomatik olarak kapatıldı',           dotCls: 'green' },
  ];
}

/* ── State ve Değişkenler ────────────────────────────────── */
let allTasks = [];
let elevMap = {};
let currentFilter = 'all'; // all, open, closed
let currentDateFilter = 'all'; // all, today, week, month
let currentTypeFilter = 'all'; // all, Asset, sensor
let selectedTaskId = null;
let visibleStaffIds = new Set();
let hiddenStaffIds = new Set();

let lastTasksJson = '';

// Sayfa ilk yüklendiğinde cache'ten okuma yapalım (0ms anında açılış için)
function tryLoadFromCache() {
  try {
    const cachedTasks = localStorage.getItem('edgeops_cache_timeline_tasks');
    const cachedElevs = localStorage.getItem('edgeops_cache_timeline_elevs');
    if (cachedElevs) {
      elevMap = JSON.parse(cachedElevs);
    }
    if (cachedTasks) {
      const parsed = JSON.parse(cachedTasks);
      if (parsed && parsed.length) {
        allTasks = parsed;
        lastTasksJson = JSON.stringify(allTasks);
        renderTaskList();
        // İlk görevi otomatik seç
        if (allTasks.length > 0 && !selectedTaskId) {
          selectTask(allTasks[0].id);
        }
      }
    }
  } catch (err) {
    console.warn('[Timeline] Cache loading error:', err);
  }
}

async function loadData(silent = false) {
  try {
    const listBody = document.getElementById('taskListBody');
    if (!silent && !allTasks.length) {
      listBody.innerHTML = '<div class="panel-loading" style="padding:40px 0;">Veri yükleniyor…</div>';
    }
    
    // Tüm verileri paralel olarak API'lerden çekelim
    const [Assets, staff, tasks] = await Promise.all([
      API.getAssets().catch(err => { console.warn('[Timeline] getAssets error:', err); return []; }),
      API.getStaff().catch(err => { console.warn('[Timeline] getStaff error:', err); return []; }),
      API.getTasks().catch(err => { console.warn('[Timeline] getTasks error:', err); return []; })
    ]);

    elevMap = Object.fromEntries(Assets.map(e => [e.id, e.label || e.id]));

    const visibleStaff = getVisibleStaff(staff);
    visibleStaffIds = new Set(visibleStaff.map(s => s.id));
    hiddenStaffIds = new Set(staff.map(s => s.id).filter(id => id && !visibleStaffIds.has(id)));

    // Görev listelerini işleyelim
    const seen = new Set();
    const rawTasks = (tasks || []).filter(t => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
    
    // Normalize edelim ve en yeni en üste sıralayalım
    const normalizedTasks = rawTasks.map(t => {
      const isSensor = (t.asset_type === 'sensor') || (t.task_type || '').startsWith('PRR-') || t.sensor_id || t.location_id;
      
      const assetId = t.sensor_id || t.location_id || t.asset_id || '';
      const assetName = t.location_label || t.asset_name || (t.asset_id ? (elevMap[t.asset_id] || t.asset_id) : '');
      const faultType = t.task_label || t.fault_type || 'Bildirim';

      let assignedName = '';
      if (t.assigned_to) {
        assignedName = typeof t.assigned_to === 'object' ? t.assigned_to.name : t.assigned_to;
      }

      return {
        ...t,
        is_sensor: isSensor,
        asset_id: assetId,
        asset_name: assetName,
        fault_type: faultType,
        assigned_to_name: assignedName,
        _ts_created:  toMs(t.ts_created),
        _ts_accepted: toMs(t.ts_accepted),
        _ts_arrived:  toMs(t.ts_arrived),
        _ts_fixed:    toMs(t.ts_fixed || t.ts_completed), 
        _ts_closed:   toMs(t.ts_closed) || toMs(t.ts_fixed || t.ts_completed), 
        assigned_to: hiddenStaffIds.has(t.assigned_to) ? '' : t.assigned_to,
      };
    }).sort((a, b) => (b._ts_created || 0) - (a._ts_created || 0)); 

    // Sadece veri değiştiğinde yenileyelim (Fark yoksa DOM güncellenmez, sürekli gösterilir)
    const currentTasksJson = JSON.stringify(normalizedTasks);
    if (currentTasksJson === lastTasksJson) {
      return;
    }
    lastTasksJson = currentTasksJson;
    allTasks = normalizedTasks;

    // Başarılı veriyi cache'e yazalım
    try {
      localStorage.setItem('edgeops_cache_timeline_tasks', currentTasksJson);
      localStorage.setItem('edgeops_cache_timeline_elevs', JSON.stringify(elevMap));
    } catch (e) {
      console.warn('[Timeline] Cache write error:', e);
    }

    renderTaskList();
    
    // Eğer hali hazırda tıklanmış/seçilmiş bir görev detayta açıksa, detay panelini de son state ile güncelle
    if (selectedTaskId) {
      const activeTask = allTasks.find(t => t.id === selectedTaskId);
      if (activeTask) {
        renderTimelineCard(activeTask);
      }
    }
  } catch (err) {
    console.error('[Timeline] Veri alınamadı:', err);
    if (!silent) {
      document.getElementById('taskListBody').innerHTML = `<div class="empty-state" style="padding:40px 0;">Veri yüklenemedi: ${sanitize(err.message)}</div>`;
    }
  }
}

/* ── Sol/Sağ Liste Render ────────────────────────────────── */
function renderTaskList() {
  const listBody = document.getElementById('taskListBody');
  const countLabel = document.getElementById('taskCountLabel');

  // Filtreleme (Durum, Zaman ve Tip)
  const filtered = allTasks.filter(t => {
    // 1. Durum Kontrolü
    if (currentFilter === 'open' && (t.status === 'completed' || t.status === 'rejected')) return false;
    if (currentFilter === 'closed' && t.status !== 'completed') return false;

    // 2. Zaman Kontrolü
    if (currentDateFilter !== 'all') {
      const d = new Date(t._ts_created || 0);
      const today = new Date();
      if (currentDateFilter === 'today') {
        if (!isToday(d)) return false;
      } else if (currentDateFilter === 'week') {
        const diffDays = Math.abs(today - d) / (1000 * 60 * 60 * 24);
        if (diffDays > 7) return false;
      } else if (currentDateFilter === 'month') {
        if (d.getMonth() !== today.getMonth() || d.getFullYear() !== today.getFullYear()) return false;
      }
    }

    // 3. Görev Tipi Kontrolü
    if (currentTypeFilter === 'Asset' && t.is_sensor) return false;
    if (currentTypeFilter === 'sensor' && !t.is_sensor) return false;

    return true; 
  });

  countLabel.textContent = `${filtered.length} Görev Bulundu`;

  if (!filtered.length) {
    listBody.innerHTML = '<div class="empty-state" style="padding:40px 0; font-size:0.9rem;">Seçili kritere uygun görev bulunamadı.</div>';
    return;
  }

  // Tarihe göre gruplama
  const groups = {};
  filtered.forEach(t => {
    const d = new Date(t._ts_created || 0);
    let groupName = '';
    if (isToday(d)) groupName = 'Bugün';
    else if (isYesterday(d)) groupName = 'Dün';
    else {
      groupName = d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
    }
    
    if (!groups[groupName]) groups[groupName] = [];
    groups[groupName].push(t);
  });

  // HTML oluştur
  let html = '';
  for (const [dateLabel, tasks] of Object.entries(groups)) {
    html += `<div style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); margin: 12px 0 4px 6px; text-transform: uppercase;">${dateLabel}</div>`;
    
    tasks.forEach(t => {
      const assetName = t.asset_name || '—';
      const timeStr = t._ts_created ? new Date(t._ts_created).toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'}) : '--:--';
      const badge = STATUS_MAP[t.status] || { cls: 'badge-gray', label: t.status || '—' };
      const isSelected = selectedTaskId === t.id ? ' border-color: var(--primary-color); background: rgba(99, 102, 241, 0.04);' : '';
      const safeId = sanitize(t.id);
      const prefix = t.is_sensor
        ? `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:-2px;margin-right:6px;display:inline-block;color:#6366f1;"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83"/></svg>`
        : `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:-2px;margin-right:6px;display:inline-block;color:#10b981;"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="6" x2="12" y2="10"/><polyline points="9 8 12 6 15 8"/></svg>`;

      html += `
        <div class="card task-list-card" onclick="selectTask('${safeId}')" style="padding: 12px; cursor: pointer; transition: all 0.2s; border: 1px solid var(--border-color); flex-shrink: 0;${isSelected}">
          <div style="display:flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
            <div style="font-weight: 600; font-size: 0.95rem;">${prefix}${sanitize(assetName)}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); font-family: 'JetBrains Mono', monospace;">${sanitize(timeStr)}</div>
          </div>
          <div style="display:flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 0.8rem; color: var(--text-muted);">${sanitize(t.fault_type || 'Görev')}</div>
            <span class="badge ${badge.cls}" style="font-size: 0.7rem;">${sanitize(badge.label)}</span>
          </div>
        </div>
      `;
    });
  }

  listBody.innerHTML = html;

  // Hover efektleri
  document.querySelectorAll('.task-list-card').forEach(el => {
    el.addEventListener('mouseenter', () => { el.style.borderColor = 'var(--primary-color)'; });
    el.addEventListener('mouseleave', () => { 
      // Sadece seçili değilse border rengini geri al
      if (!el.getAttribute('style').includes('background: rgba')) {
        el.style.borderColor = 'var(--border-color)'; 
      }
    });
  });
}

function selectTask(taskId) {
  selectedTaskId = taskId;
  renderTaskList(); // listeyi yeniden render edip seçili sınıfı uygula
  const task = allTasks.find(t => t.id === taskId);
  if (task) {
    renderTimelineCard(task);
  }
}

/* ── Timeline Kartı Render ───────────────────────────────── */
function renderTimelineCard(task) {
  const body     = document.getElementById('timelineBody');
  const subtitle = document.getElementById('timelineSubtitle');

  const assetName = sanitize(task.asset_name || '—');
  const faultType = sanitize(task.fault_type || 'Görev');
  const taskId    = sanitize(task.id || '—');

  const subtitleIcon = task.is_sensor
    ? `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:-2px;margin-right:6px;display:inline-block;color:#6366f1;"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83"/></svg>`
    : `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:-2px;margin-right:6px;display:inline-block;color:#10b981;"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="6" x2="12" y2="10"/><polyline points="9 8 12 6 15 8"/></svg>`;

  subtitle.innerHTML = `${subtitleIcon} ${assetName} · ${faultType} · ${taskId}`;

  // Toplam süre
  const totalMin = task._ts_closed && task._ts_created
    ? diffMin(task._ts_created, task._ts_closed)
    : (task._ts_fixed && task._ts_created ? diffMin(task._ts_created, task._ts_fixed) : null);

  // Müdahale süresi (arıza → kabul)
  const responseMin = task._ts_accepted && task._ts_created
    ? diffMin(task._ts_created, task._ts_accepted) : null;

  // Onarım süresi (varış → düzeldi) - sensör ise varış adımı yok
  const repairMin = !task.is_sensor && task._ts_fixed && task._ts_arrived
    ? diffMin(task._ts_arrived, task._ts_fixed) : null;

  // Durum badge
  const statusBadge = STATUS_MAP[task.status] || { cls: 'badge-gray', label: task.status || '—' };
  
  // Personel bilgisi
  const assignedInfo = task.assigned_to_name ? `<div style="margin-top:4px; font-size:0.8rem; color:var(--text-muted)">Teknisyen: <strong>${sanitize(task.assigned_to_name)}</strong></div>` : '';

  // KPI satırı
  const kpiHtml = `
    <div class="timeline-kpi">
      <div class="tl-kpi-item">
        <div class="tl-kpi-label">Görev Durumu</div>
        <div class="tl-kpi-value" style="font-size:.9rem;">
          <span class="badge ${statusBadge.cls}">${statusBadge.label}</span>
        </div>
        ${assignedInfo}
      </div>
      <div class="tl-kpi-item">
        <div class="tl-kpi-label">Toplam Süre</div>
        <div class="tl-kpi-value">${totalMin != null ? totalMin + ' dk' : '—'}</div>
      </div>
      <div class="tl-kpi-item">
        <div class="tl-kpi-label">Müdahale (Arıza→Kabul)</div>
        <div class="tl-kpi-value">${responseMin != null ? responseMin + ' dk' : '—'}</div>
      </div>
      <div class="tl-kpi-item" style="${task.is_sensor ? 'display:none;' : ''}">
        <div class="tl-kpi-label">Onarım (Varış→Düzeldi)</div>
        <div class="tl-kpi-value">${repairMin != null ? repairMin + ' dk' : '—'}</div>
      </div>
    </div>`;

  // Timeline adımları
  let prevTs = null;
  const currentSteps = timelineStepsFor(task);
  const stepsHtml = currentSteps.map((step, idx) => {
    let ts = task[step.key];
    
    // Eğer görev timeout veya rejected ise, sonraki adımlar da boş görünmeli
    const timeStr = fmtDateTime(ts);
    const delta   = (ts && prevTs) ? diffMin(prevTs, ts) : null;
    const isDone  = !!ts;
    const isLast  = idx === currentSteps.length - 1;

    if (ts) prevTs = ts;

    return `
      <div class="timeline-step${isDone ? ' done' : ''}">
        <div class="tl-left">
          <div class="tl-dot ${isDone ? step.dotCls : 'empty'}"></div>
          ${!isLast ? '<div class="tl-line"></div>' : ''}
        </div>
        <div class="tl-content">
          <div class="tl-header">
            <span class="tl-label${isDone ? '' : ' pending'}">${step.label}</span>
            ${timeStr ? `<span class="tl-time">${timeStr}</span>` : ''}
            ${delta !== null ? `<span class="tl-delta">+${delta} dk</span>` : ''}
          </div>
          <div class="tl-desc${isDone ? '' : ' pending'}">${step.desc}</div>
          ${!isDone && task.status !== 'rejected' && task.status !== 'timeout' ? '<div style="margin-top:4px;"><span class="badge badge-gray" style="font-size:.65rem;">Henüz gerçekleşmedi</span></div>' : ''}
          ${!isDone && (task.status === 'rejected' || task.status === 'timeout') ? `<div style="margin-top:4px;"><span class="badge badge-red" style="font-size:.65rem;">İptal (${task.status})</span></div>` : ''}
        </div>
      </div>`;
  }).join('');

  // "Personele Ata" butonu: tamamlanmamış görevler için
  const canAssign = !['completed', 'rejected', 'timeout'].includes(task.status);
  const assignBtn = canAssign
    ? `<div style="margin-top:16px;">
         <button class="btn btn-primary" onclick="openAssignModal('${sanitize(task.id)}')"
           style="display:inline-flex;align-items:center;gap:6px;font-size:.82rem;padding:7px 16px;">
           <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
             <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/>
             <circle cx="9" cy="7" r="4"/>
             <line x1="19" y1="8" x2="19" y2="14"/>
             <line x1="22" y1="11" x2="16" y2="11"/>
           </svg>
           Personele Ata
         </button>
       </div>`
    : '';

  body.innerHTML = kpiHtml + assignBtn + `<div class="timeline-container">${stepsHtml}</div>`;
}

/* ── Görev Atama Modal ───────────────────────────────────── */
function injectAssignModal() {
  if (document.getElementById('assignModal')) return;
  const modal = document.createElement('div');
  modal.id = 'assignModal';
  modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div style="background:var(--surface,#fff);border-radius:12px;width:360px;max-width:92vw;box-shadow:0 8px 32px rgba(0,0,0,.25);overflow:hidden;">
      <div style="padding:18px 20px 14px;border-bottom:1px solid var(--border-color,#E2E8F0);display:flex;justify-content:space-between;align-items:center;">
        <span style="font-weight:700;font-size:1rem;">Personele Ata</span>
        <button onclick="closeAssignModal()" style="background:none;border:none;cursor:pointer;font-size:1.2rem;color:var(--text-muted,#94A3B8);">✕</button>
      </div>
      <div id="assignStaffList" style="padding:12px 16px;max-height:280px;overflow-y:auto;">
        <div style="padding:20px 0;text-align:center;color:var(--text-muted);">Yükleniyor…</div>
      </div>
      <div style="padding:12px 20px;border-top:1px solid var(--border-color,#E2E8F0);display:flex;justify-content:flex-end;gap:8px;">
        <button onclick="closeAssignModal()" style="padding:7px 16px;border:1px solid var(--border-color,#E2E8F0);background:none;border-radius:6px;cursor:pointer;font-size:.82rem;">İptal</button>
        <button id="assignConfirmBtn" onclick="confirmAssign()" disabled
          style="padding:7px 16px;background:var(--primary-color,#6366F1);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.82rem;opacity:.5;">
          Atama Yap
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) closeAssignModal(); });
}

let _assignTaskId  = null;
let _assignCardId  = null;

async function openAssignModal(taskId) {
  injectAssignModal();
  _assignTaskId = taskId;
  _assignCardId = null;

  const modal    = document.getElementById('assignModal');
  const listEl   = document.getElementById('assignStaffList');
  const confirmBtn = document.getElementById('assignConfirmBtn');
  confirmBtn.disabled = true;
  confirmBtn.style.opacity = '.5';

  modal.style.display = 'flex';
  listEl.innerHTML = '<div style="padding:20px 0;text-align:center;color:var(--text-muted);">Personel yükleniyor…</div>';

  try {
    const staffList = getVisibleStaff(await API.getStaff());
    if (!staffList.length) {
      listEl.innerHTML = '<div style="padding:20px 0;text-align:center;color:var(--text-muted);">Kayıtlı personel bulunamadı.</div>';
      return;
    }

    listEl.innerHTML = staffList.map(s => {
      const isOnline  = s.online || s.state === 'idle' || s.state === 'active';
      const stateDot  = isOnline ? '#22C55E' : '#94A3B8';
      const stateTxt  = isOnline ? (s.state || 'Çevrimiçi') : 'Çevrimdışı';
      return `
        <label style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;cursor:pointer;border:1px solid transparent;margin-bottom:4px;transition:all .15s;"
               class="assign-staff-row" data-card="${sanitize(s.id)}">
          <input type="radio" name="assignCard" value="${sanitize(s.id)}" style="accent-color:var(--primary-color,#6366F1);">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:.88rem;">${sanitize(s.name || s.id)}</div>
            <div style="font-size:.75rem;color:var(--text-muted);">${sanitize(s.role || '—')}</div>
          </div>
          <div style="display:flex;align-items:center;gap:5px;font-size:.75rem;color:var(--text-muted);">
            <span style="width:7px;height:7px;border-radius:50%;background:${stateDot};display:inline-block;"></span>
            ${sanitize(stateTxt)}
          </div>
        </label>`;
    }).join('');

    // Radio seçimi → confirm aktif
    listEl.querySelectorAll('input[type=radio]').forEach(r => {
      r.addEventListener('change', () => {
        _assignCardId = r.value;
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
        listEl.querySelectorAll('.assign-staff-row').forEach(row => {
          row.style.borderColor = row.dataset.card === _assignCardId
            ? 'var(--primary-color,#6366F1)' : 'transparent';
          row.style.background = row.dataset.card === _assignCardId
            ? 'rgba(99,102,241,.06)' : '';
        });
      });
    });
  } catch (e) {
    listEl.innerHTML = `<div style="padding:20px 0;text-align:center;color:#ef4444;">Personel yüklenemedi: ${sanitize(e.message)}</div>`;
  }
}

function closeAssignModal() {
  const modal = document.getElementById('assignModal');
  if (modal) modal.style.display = 'none';
  _assignTaskId = null;
  _assignCardId = null;
}

async function confirmAssign() {
  if (!_assignTaskId || !_assignCardId) return;
  const confirmBtn = document.getElementById('assignConfirmBtn');
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Atanıyor…';

  try {
    const tid = _assignTaskId;
    const cid = _assignCardId;
    await API.assignTask(tid, cid);
    closeAssignModal();
    Notify.info('Görev Atandı', `${cid} kartına görev gönderildi.`);
    loadData(true);
  } catch (e) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Atama Yap';
    confirmBtn.style.opacity = '1';
    Notify.info('Hata', `Atama başarısız: ${e.message}`);
  }
}

/* ── Filtre Kontrolleri ──────────────────────────────────── */
function setStatusFilter(filterType) {
  currentFilter = filterType;
  
  // UI Aktif Sınıfı Güncelleme
  const buttons = ['filterAll', 'filterOpen', 'filterClosed'];
  buttons.forEach(id => {
    const btn = document.getElementById(id);
    btn.classList.remove('active');
    btn.style.background = 'transparent';
    btn.style.color = 'var(--text-color, #475569)';
    btn.style.fontWeight = 'normal';
    btn.style.boxShadow = 'none';
    btn.style.border = 'none';
  });

  const activeBtnMap = { 'all': 'filterAll', 'open': 'filterOpen', 'closed': 'filterClosed' };
  const activeBtn = document.getElementById(activeBtnMap[filterType]);
  activeBtn.classList.add('active');
  
  // Canlı (Badge) stili - soluk mavi arkaplan, koyu doygun mavi metin, ortalanmış.
  activeBtn.style.background = '#e0e7ff';
  activeBtn.style.color = '#4338ca';
  activeBtn.style.fontWeight = '600';
  activeBtn.style.borderRadius = '6px';
  activeBtn.style.border = 'none';
  activeBtn.style.boxShadow = 'none';

  renderTaskList();
}

function setDateFilter(val) {
  currentDateFilter = val;
  renderTaskList();
}

function setTypeFilter(type) {
  currentTypeFilter = type;
  
  const buttons = ['typeFilterAll', 'typeFilterAsset', 'typeFilterSensor'];
  buttons.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.classList.remove('active');
      btn.style.background = 'transparent';
      btn.style.color = 'var(--text-color, #475569)';
      btn.style.fontWeight = 'normal';
      btn.style.boxShadow = 'none';
      btn.style.border = 'none';
    }
  });

  const activeBtnMap = { 'all': 'typeFilterAll', 'Asset': 'typeFilterAsset', 'sensor': 'typeFilterSensor' };
  const activeBtn = document.getElementById(activeBtnMap[type]);
  if (activeBtn) {
    activeBtn.classList.add('active');
    activeBtn.style.background = '#e0e7ff';
    activeBtn.style.color = '#4338ca';
    activeBtn.style.fontWeight = '600';
    activeBtn.style.borderRadius = '6px';
    activeBtn.style.border = 'none';
    activeBtn.style.boxShadow = 'none';
  }

  renderTaskList();
}

/* ── Init ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  Notify.init();
  tryLoadFromCache(); // Cache'ten anında yükle (0ms!)
  loadData(true);     // Arka planda sessizce en güncel veriyi çek

  // Her 10 saniyede bir arkaplanda sessizce yenileme yap
  setInterval(() => {
    loadData(true);
  }, CONFIG.POLL_INTERVAL_MS);

  document.getElementById('refreshBtn').addEventListener('click', () => {
    selectedTaskId = null; // Sayfa yenilenince seçimi temizle
    document.getElementById('timelineBody').innerHTML = `
        <div class="empty-state" style="padding:60px 0;">
          <svg width="48" height="48" fill="none" stroke="var(--text-muted)" stroke-width="1.5" viewBox="0 0 24 24" style="margin-bottom:16px; opacity:0.5;">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg><br/>
          Detayları görmek için sağdaki listeden bir görev seçin.
        </div>`;
    document.getElementById('timelineSubtitle').textContent = 'Listeden bir görev seçin';
    loadData();
  });

  // Durum Filtre butonları
  document.getElementById('filterAll').addEventListener('click', () => setStatusFilter('all'));
  document.getElementById('filterOpen').addEventListener('click', () => setStatusFilter('open'));
  document.getElementById('filterClosed').addEventListener('click', () => setStatusFilter('closed'));

  // Görev Tipi Filtre butonları
  document.getElementById('typeFilterAll').addEventListener('click', () => setTypeFilter('all'));
  document.getElementById('typeFilterAsset').addEventListener('click', () => setTypeFilter('Asset'));
  document.getElementById('typeFilterSensor').addEventListener('click', () => setTypeFilter('sensor'));
  
  // Tarih Filtre dropdown
  document.getElementById('dateFilterSelect').addEventListener('change', (e) => setDateFilter(e.target.value));
});

