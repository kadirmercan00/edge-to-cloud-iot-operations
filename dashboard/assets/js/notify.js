/* ============================================================
   EDGE-OPS AI — notify.js
   Arıza bildirimleri: sesli uyarı + toast popup
   Web Audio API kullanır — harici ses dosyası gerekmez.
   ============================================================ */
'use strict';

const Notify = (() => {
  let audioCtx = null;
  let enabled  = true;
  let toastContainer = null;

  /* ── Audio context ─────────────────────────────────────── */
  function getCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
  }

  function beepNow(ctx) {
    const t = ctx.currentTime;

    // Her tur: yüksek ton (0.35s) → alçak ton (0.35s), toplam 3 tur = ~2.1s
    const cycles = 3;
    const hiFreq = 1100;
    const loFreq = 700;
    const cycleLen = 0.7;

    for (let i = 0; i < cycles; i++) {
      const start = t + i * cycleLen;

      // Yüksek ton
      const oscHi  = ctx.createOscillator();
      const gainHi = ctx.createGain();
      oscHi.connect(gainHi);
      gainHi.connect(ctx.destination);
      oscHi.type = 'square';
      oscHi.frequency.setValueAtTime(hiFreq, start);
      gainHi.gain.setValueAtTime(0, start);
      gainHi.gain.linearRampToValueAtTime(0.6, start + 0.02);
      gainHi.gain.setValueAtTime(0.6, start + 0.3);
      gainHi.gain.linearRampToValueAtTime(0, start + 0.35);
      oscHi.start(start);
      oscHi.stop(start + 0.35);

      // Alçak ton
      const oscLo  = ctx.createOscillator();
      const gainLo = ctx.createGain();
      oscLo.connect(gainLo);
      gainLo.connect(ctx.destination);
      oscLo.type = 'square';
      oscLo.frequency.setValueAtTime(loFreq, start + 0.35);
      gainLo.gain.setValueAtTime(0, start + 0.35);
      gainLo.gain.linearRampToValueAtTime(0.5, start + 0.37);
      gainLo.gain.setValueAtTime(0.5, start + 0.65);
      gainLo.gain.linearRampToValueAtTime(0, start + 0.70);
      oscLo.start(start + 0.35);
      oscLo.stop(start + 0.70);
    }
  }

  /* ── Arıza alarmı: 3 tur yüksek→alçak */
  function playAlarm() {
    if (!enabled) return;
    try {
      const ctx = getCtx();
      if (ctx.state === 'suspended') {
        ctx.resume().then(() => beepNow(ctx));
      } else {
        beepNow(ctx);
      }
    } catch (e) {
      console.warn('[Notify] Ses çalınamadı:', e);
    }
  }

  /* ── Toast container oluştur */
  function ensureContainer() {
    if (toastContainer) return toastContainer;
    toastContainer = document.createElement('div');
    toastContainer.id = 'notifyContainer';
    Object.assign(toastContainer.style, {
      position:  'fixed',
      top:       '20px',
      right:     '20px',
      zIndex:    '9999',
      display:   'flex',
      flexDirection: 'column',
      gap:       '10px',
      maxWidth:  '340px',
    });
    document.body.appendChild(toastContainer);
    return toastContainer;
  }

  /* ── Toast göster */
  function showToast(title, message, type = 'fault') {
    const container = ensureContainer();

    const colors = {
      fault:   { bg: '#FEF2F2', border: '#FCA5A5', icon: '⚠️', titleColor: '#991B1B' },
      info:    { bg: '#EFF6FF', border: '#93C5FD', icon: 'ℹ️', titleColor: '#1E40AF' },
      success: { bg: '#F0FDF4', border: '#86EFAC', icon: '✅', titleColor: '#166534' },
    };
    const c = colors[type] || colors.fault;

    const toast = document.createElement('div');
    Object.assign(toast.style, {
      background:   c.bg,
      border:       `1px solid ${c.border}`,
      borderRadius: '10px',
      padding:      '12px 14px',
      boxShadow:    '0 4px 16px rgba(0,0,0,.12)',
      display:      'flex',
      gap:          '10px',
      alignItems:   'flex-start',
      animation:    'notifySlideIn .25s ease',
      cursor:       'pointer',
    });

    toast.innerHTML = `
      <span style="font-size:1.3rem;line-height:1;">${c.icon}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:.85rem;color:${c.titleColor};margin-bottom:3px;">${sanitize(title)}</div>
        <div style="font-size:.78rem;color:#475569;line-height:1.4;">${sanitize(message)}</div>
        <div style="font-size:.7rem;color:#94A3B8;margin-top:4px;">${new Date().toLocaleTimeString('tr-TR')}</div>
      </div>
      <button onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;color:#94A3B8;font-size:1rem;line-height:1;padding:0;flex-shrink:0;">✕</button>
    `;

    toast.addEventListener('click', (e) => {
      if (e.target.tagName !== 'BUTTON') toast.remove();
    });

    container.prepend(toast);

    // 8 saniye sonra otomatik kapat
    setTimeout(() => toast.remove(), 8000);
  }

  /* ── Ses toggle butonu oluştur */
  function renderSoundToggle() {
    const topbar = document.querySelector('.topbar-right') || document.querySelector('.topbar');
    if (!topbar) return;

    const btn = document.createElement('button');
    btn.id = 'soundToggleBtn';
    btn.title = 'Ses bildirimi aç/kapat';
    Object.assign(btn.style, {
      background: 'none',
      border:     '1px solid var(--border, #E2E8F0)',
      borderRadius: '6px',
      padding:    '5px 9px',
      cursor:     'pointer',
      fontSize:   '1rem',
      color:      'var(--text-secondary, #64748B)',
      lineHeight: '1',
    });
    btn.textContent = '🔔';
    btn.addEventListener('click', () => {
      // Ses context'i kullanıcı etkileşimiyle başlat
      getCtx();
      enabled = !enabled;
      btn.textContent = enabled ? '🔔' : '🔕';
      btn.title = enabled ? 'Ses açık — kapat' : 'Ses kapalı — aç';
    });

    topbar.insertBefore(btn, topbar.firstChild);
  }

  /* ── CSS animasyonu ekle */
  function injectStyles() {
    if (document.getElementById('notifyStyles')) return;
    const style = document.createElement('style');
    style.id = 'notifyStyles';
    style.textContent = `
      @keyframes notifySlideIn {
        from { opacity:0; transform: translateX(20px); }
        to   { opacity:1; transform: translateX(0); }
      }
    `;
    document.head.appendChild(style);
  }

  /* ── Arıza polling (tüm sayfalar için ortak) ─────────────── */
  const SESSION_KEY = 'edgeops_seen_tasks';
  let   pollTimer   = null;

  function loadSeen() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  }

  function saveSeen(set) {
    try {
      // Sadece son 200 task_id'yi tut
      const arr = [...set].slice(-200);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(arr));
    } catch {}
  }

  async function pollFaults() {
    try {
      const data     = await API.getSummary();
      const activity = data.activity_log || [];
      const seen     = loadSeen();
      const elevLabel = {};
      (data.Assets || []).forEach(e => { elevLabel[e.id] = e.label || e.id; });

      // sessionStorage boşsa (ilk oturum açılışı): mevcut task'ları seed'le, bildirim gönderme
      if (seen.size === 0) {
        activity.forEach(a => { if (a.task_id) seen.add(a.task_id); });
        saveSeen(seen);
        return;
      }

      let changed = false;
      activity.forEach(a => {
        if (!a.task_id || seen.has(a.task_id)) return;
        seen.add(a.task_id);
        changed = true;
        const assetId = (a.text || '').split('—')[0].trim();
        const name    = elevLabel[assetId] || assetId || 'Yeni Arıza';
        playAlarm();
        showToast('⚠️ Endüstriyel Varlık Arızası', `${name} arızalı duruma geçti.`, 'fault');
      });

      if (changed) saveSeen(seen);
    } catch (e) {
      console.warn('[Notify] pollFaults hatası:', e);
    }
  }

  /* ── Public API */
  return {
    init() {
      injectStyles();
      document.addEventListener('click', () => getCtx(), { once: true });
      renderSoundToggle();
      // Tüm sayfalarda arıza polling başlat
      pollFaults();
      pollTimer = setInterval(pollFaults, CONFIG.POLL_INTERVAL_MS || 10000);
    },

    fault(AssetName) {
      playAlarm();
      showToast('⚠️ Endüstriyel Varlık Arızası', `${AssetName} arızalı duruma geçti.`, 'fault');
    },

    info(title, message) {
      showToast(title, message, 'info');
    },
  };
})();

