/**
 * auth.js — Kimlik Doğrulama ve Oturum Yönetimi
 *
 * GÜVENLIK:
 *  - Token sadece sessionStorage'da tutulur (XSS saldırılarına karşı
 *    localStorage yerine sessionStorage tercih edilebilir; burada
 *    "remember me" seçeneğine göre dinamik karar verilir).
 *  - Sayfa değiştikçe token geçerliliği kontrol edilir.
 *  - Token içindeki exp alanı client-side doğrulanır (ek güvenlik katmanı).
 *    Asıl doğrulama her zaman sunucu tarafında yapılmalıdır.
 */

const Auth = (() => {

  const KEY = CONFIG.TOKEN_KEY;

  /** Token'ı depola */
  function saveToken(token, remember = false) {
    const store = remember ? localStorage : sessionStorage;
    store.setItem(KEY, token);
    // Diğerini temizle
    const other = remember ? sessionStorage : localStorage;
    other.removeItem(KEY);
  }

  /** Token'ı oku (her iki depodan) */
  function getToken() {
    return sessionStorage.getItem(KEY) || localStorage.getItem(KEY);
  }

  /** Token'ı sil (çıkış yap) */
  function clearToken() {
    sessionStorage.removeItem(KEY);
    localStorage.removeItem(KEY);
  }

  /** Token geçerli mi? (exp kontrolü) */
  function isTokenValid() {
    const token = getToken();
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token));
      return payload.exp > Date.now();
    } catch {
      return false;
    }
  }

  /** Token içinden kullanıcı bilgisini al */
  function getCurrentUser() {
    const raw = sessionStorage.getItem('aom_user') || localStorage.getItem('aom_user');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  /** Kullanıcı bilgisini depola */
  function saveUser(user, remember = false) {
    const store = remember ? localStorage : sessionStorage;
    store.setItem('aom_user', JSON.stringify(user));
    const other = remember ? sessionStorage : localStorage;
    other.removeItem('aom_user');
  }

  /** Korumalı sayfaları kontrol et — oturum yoksa login'e yönlendir */
  function guardPage() {
    if (!isTokenValid()) {
      clearToken();
      window.location.href = 'index.html';
    }
  }

  /** Login sayfasında zaten giriş yapmışsa dashboard'a yönlendir */
  function redirectIfAuthenticated() {
    if (isTokenValid()) {
      window.location.href = 'dashboard.html';
    }
  }

  /** Giriş yap — Auth her zaman yerel DEMO_USERS listesinden yapılır */
  async function login(username, password, remember = false) {
    const found = (CONFIG.DEMO_USERS || []).find(
      u => u.username === username && u.password === password
    );
    if (!found) throw new Error('Kullanıcı adı veya şifre hatalı.');

    const exp   = Date.now() + CONFIG.SESSION_DURATION_MS;
    const token = btoa(JSON.stringify({ sub: found.username, exp }));
    const user  = { name: found.name, role: found.role, username: found.username };

    saveToken(token, remember);
    saveUser(user, remember);
    return user;
  }

  /** Çıkış yap */
  function logout() {
    clearToken();
    window.location.href = 'index.html';
  }

  /** Kullanıcının rolü verilen listede değilse dashboard'a yönlendir */
  function guardRole(allowedRoles) {
    const user = getCurrentUser();
    if (!user || !allowedRoles.includes(user.role)) {
      window.location.href = 'dashboard.html';
    }
  }

  /**
   * Sidebar'daki yönetim bölümünü (Endüstriyel Varlık Ekle / Personel Ekle) rol bazlı gizle.
   * Yönetici değilse söz konusu nav linkleri ve boş kalan section gizlenir.
   */
  function applyRoleUI() {
    const user = getCurrentUser();
    const isSupervisor = user && (CONFIG.SUPERVISOR_ROLES || []).includes(user.role);
    if (isSupervisor) return; // Supervisor → hiçbir şeyi gizleme

    // add-Asset / add-staff linklerini bul ve gizle
    document.querySelectorAll('.sidebar-nav a.nav-item').forEach(link => {
      const href = link.getAttribute('href') || '';
      if (href === 'add-asset.html' || href === 'add-staff.html') {
        link.style.display = 'none';
      }
    });

    // İçi boş kalan "Yönetim" section'ını gizle
    document.querySelectorAll('.sidebar-section').forEach(section => {
      const label = section.querySelector('.sidebar-section-label');
      if (label && label.textContent.trim() === 'Yönetim') {
        section.style.display = 'none';
      }
    });
  }

  return { login, logout, guardPage, guardRole, redirectIfAuthenticated, getCurrentUser, isTokenValid, applyRoleUI };

})();

