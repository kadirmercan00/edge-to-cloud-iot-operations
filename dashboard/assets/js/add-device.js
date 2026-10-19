/* ============================================================
   EDGE-OPS AI — add-device.js
   Hem Endüstriyel Varlık hem personel ekleme formları için ortak mantık.
   initAddDevice(opts) ile başlatılır.

   opts = {
     deviceType:   'Asset' | 'staff',
     thingPrefix:  (formData) => string   // Thing adı önizleme için
     idField:      'assetId' | 'cardId'   // input element ID'si
     idKey:        'asset_id' | 'card_id' // API formData anahtarı
     thingPreviewId: string
   }
   ============================================================ */
'use strict';

Auth.guardPage();
Auth.guardRole(CONFIG.SUPERVISOR_ROLES);

/* ── Saat & Avatar ───────────────────────────────────────── */
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

/* ── UUID yardımcı ───────────────────────────────────────── */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/* ── Ana init fonksiyonu ─────────────────────────────────── */
function initAddDevice(opts) {
  const { deviceType, thingPrefix, idField, idKey, thingPreviewId } = opts;
  const ID_REGEX = /^[A-Za-z0-9_-]{3,32}$/;

  /* Step göstergesi */
  function setStep(n) {
    for (let i = 1; i <= 3; i++) {
      const el = document.getElementById('step' + i);
      if (!el) continue;
      el.classList.toggle('active', i <= n);
      el.classList.toggle('done', i < n);
    }
    for (let i = 1; i <= 3; i++) {
      const sec = document.getElementById('section' + i);
      if (sec) sec.classList.toggle('hidden', i !== n);
    }
  }

  /* Thing önizlemesi */
  const idInput      = document.getElementById(idField);
  const thingPreview = document.getElementById(thingPreviewId);

  if (idInput && thingPreview) {
    idInput.addEventListener('input', () => {
      const val = idInput.value.trim();
      const fakeData = { [idKey]: val, site: 'facility-01' };
      thingPreview.value = val ? thingPrefix(fakeData) : '';
    });
  }

  /* UUID butonu (sadece Endüstriyel Varlık formunda) */
  const genUuidBtn = document.getElementById('genUuidBtn');
  if (genUuidBtn) {
    genUuidBtn.addEventListener('click', () => {
      const uuidInput = document.getElementById('beaconUuid');
      if (uuidInput) uuidInput.value = generateUUID();
    });
  }

  /* Geçiş butonları */
  const nextTo2 = document.getElementById('nextToSection2');
  const nextTo3 = document.getElementById('nextToSection3');
  const back1   = document.getElementById('backToSection1');
  const back2   = document.getElementById('backToSection2');

  if (nextTo2) {
    nextTo2.addEventListener('click', () => {
      const idVal = idInput ? idInput.value.trim() : '';
      const errEl = document.getElementById(idField + 'Error') ||
                    document.getElementById('cardIdError') ||
                    document.getElementById('assetIdError');
      if (!ID_REGEX.test(idVal)) {
        if (errEl) {
          errEl.textContent = 'Geçersiz ID formatı. 3–32 karakter, harf/rakam/_/-';
          errEl.style.display = 'block';
        }
        return;
      }
      if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
      setStep(2);
    });
  }

  if (nextTo3) {
    nextTo3.addEventListener('click', () => {
      // Bölüm 2 zorunlu alanlar
      const required = deviceType === 'Asset'
        ? ['site', 'building']
        : ['displayName', 'role'];
      let ok = true;
      required.forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.value.trim()) {
          el.classList.add('input-error');
          ok = false;
        } else if (el) {
          el.classList.remove('input-error');
        }
      });
      if (!ok) return;
      setStep(3);
    });
  }

  if (back1) back1.addEventListener('click', () => setStep(1));
  if (back2) back2.addEventListener('click', () => setStep(2));

  /* Submit */
  let lastResult = null;
  const submitBtn     = document.getElementById('submitBtn');
  const submitBtnText = document.getElementById('submitBtnText');
  const submitSpinner = document.getElementById('submitSpinner');
  const globalError   = document.getElementById('globalError');

  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      /* Bölüm 3 zorunlu: site (staff) */
      if (deviceType === 'staff') {
        const siteEl = document.getElementById('site');
        if (siteEl && !siteEl.value.trim()) {
          siteEl.classList.add('input-error');
          return;
        } else if (siteEl) {
          siteEl.classList.remove('input-error');
        }
      }

      submitBtn.disabled = true;
      submitSpinner.classList.remove('hidden');
      submitBtnText.textContent = 'İşleniyor…';
      if (globalError) globalError.style.display = 'none';

      /* Form verisi topla */
      const formData = {};
      formData[idKey] = (idInput ? idInput.value.trim() : '');

      if (deviceType === 'Asset') {
        formData.site        = (document.getElementById('site')?.value?.trim()     || '');
        formData.facility    = (document.getElementById('facility')?.value?.trim() || '');
        formData.building    = (document.getElementById('building')?.value?.trim() || '');
        formData.floor       = (document.getElementById('floor')?.value?.trim()    || '');
        formData.zone        = (document.getElementById('zone')?.value?.trim()     || '');
        formData.label       = (document.getElementById('label')?.value?.trim()    || '');
        formData.beacon_uuid = (document.getElementById('beaconUuid')?.value?.trim() || generateUUID());
        formData.criticality = parseFloat(document.getElementById('criticality')?.value || '1.0');
      } else {
        formData.display_name = (document.getElementById('displayName')?.value?.trim() || '');
        formData.role         = (document.getElementById('role')?.value || '');
        formData.phone        = (document.getElementById('phone')?.value?.trim() || '');
        formData.site         = (document.getElementById('site')?.value?.trim() || '');
      }

      try {
        const result = deviceType === 'Asset'
          ? await API.addAsset(formData)
          : await API.addStaff(formData);

        lastResult = result;

        if (result && result.zip_base64) {
          const filename = `${formData[idKey]}_certs.zip`;
          API.downloadZip(result.zip_base64, filename);
        }

        /* Başarı ekranı */
        showSuccess(result, formData);

      } catch (err) {
        console.error('[AddDevice] Hata:', err);
        if (globalError) {
          globalError.textContent = err.message || 'Bilinmeyen hata oluştu.';
          globalError.style.display = 'block';
        }
        submitBtn.disabled = false;
        submitSpinner.classList.add('hidden');
        submitBtnText.textContent = deviceType === 'Asset'
          ? 'Cihaz Oluştur ve Sertifikaları İndir'
          : 'Kart Oluştur ve Sertifikaları İndir';
      }
    });
  }

  /* Başarı ekranı */
  function showSuccess(result, formData) {
    document.getElementById('formView').classList.add('hidden');
    const view = document.getElementById('successView');
    view.classList.remove('hidden');

    const thingName = result.thing_name || thingPrefix({ ...formData, site: formData.site || 'facility-01' });
    const certArn   = result.cert_arn || '—';

    document.getElementById('successSub').textContent =
      `"${thingName}" başarıyla oluşturuldu. Sertifikalar indiriliyor…`;

    const certZone = document.getElementById('certZone');
    certZone.innerHTML = `
      <div class="cert-kv"><span class="cert-k">Thing Adı</span><span class="cert-v mono">${thingName}</span></div>
      <div class="cert-kv"><span class="cert-k">Sertifika ARN</span><span class="cert-v mono" style="font-size:.72rem;word-break:break-all">${certArn}</span></div>
      ${CONFIG.MOCK_MODE ? '<div style="margin-top:10px;font-size:.75rem;color:var(--text-muted);">Mock modda gerçek ZIP üretilmez.</div>' : ''}`;

    const redownloadBtn = document.getElementById('redownloadBtn');
    if (redownloadBtn) {
      redownloadBtn.addEventListener('click', () => {
        if (lastResult && lastResult.zip_base64) {
          API.downloadZip(lastResult.zip_base64, `${formData[idKey]}_certs.zip`);
        }
      });
    }
  }
}

