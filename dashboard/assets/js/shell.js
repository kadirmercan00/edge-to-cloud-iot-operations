'use strict';

(function () {
  const current = (window.location.pathname.split('/').pop() || 'dashboard.html').toLowerCase();

  const links = [
    {
      label: 'Genel',
      items: [
        { href: 'dashboard.html', text: 'Kontrol Merkezi', icon: 'grid' },
        { href: 'timeline.html', text: 'Zaman Çizelgesi', icon: 'timeline' },
        { href: 'reports.html', text: 'Analiz & Raporlar', icon: 'chart' },
      ],
    },
    {
      label: 'Saha Yönetimi',
      items: [
        { href: 'assets.html', text: 'Varlıklar & Ekipmanlar', icon: 'Asset' },
        { href: 'staff.html', text: 'Saha Personeli & Rozetler', icon: 'users' },
        { href: 'sensors.html', text: 'Sensör Ağ Geçitleri', icon: 'sensor' },
      ],
    }
  ];

  const icon = {
    grid: '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
    Asset: '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="6" x2="12" y2="10"/><polyline points="9 8 12 6 15 8"/></svg>',
    users: '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/></svg>',
    chart: '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    timeline: '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/><circle cx="12" cy="7" r="3"/></svg>',
    sensor: '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 3h6v4H9z"/><path d="M8 7h8l2 5-2 9H8l-2-9 2-5z"/><circle cx="12" cy="16" r="2.5"/></svg>',
    tasks: '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    plus: '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
    userplus: '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>',
    sensorplus: '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 3h6v4H9z"/><path d="M8 7h8l2 5-2 9H8l-2-9 2-5z"/><line x1="12" y1="11" x2="12" y2="18"/><line x1="9" y1="14.5" x2="15" y2="14.5"/></svg>',
  };

  function renderSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    const sections = links.map(section => `
      <div class="sidebar-section">
        <div class="sidebar-section-label">${section.label}</div>
        <nav class="sidebar-nav">
          ${section.items.map(item => `
            <a href="${item.href}" class="nav-item ${current === item.href ? 'active' : ''}">
              ${icon[item.icon] || icon.grid}
              ${item.text}
            </a>
          `).join('')}
        </nav>
      </div>
    `).join('');

    sidebar.innerHTML = `
      <div class="sidebar-brand">
        <div class="sidebar-brand-name">EDGE-OPS <span style="color:#e35348;">AI</span></div>
        <div class="sidebar-brand-sub">Facility Intelligence Platform</div>
      </div>
      ${sections}
      <div class="sidebar-footer">
        <div class="sidebar-version">v${CONFIG.VERSION || '1.0.0'}</div>
        <nav class="sidebar-nav">
          <a href="#" class="nav-item" id="logoutBtn">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Çıkış
          </a>
        </nav>
      </div>
    `;
  }

  function applyAuthShell() {
    if (typeof Auth === 'undefined') return;
    Auth.guardPage();
    Auth.applyRoleUI();
    const user = Auth.getCurrentUser();
    const av = document.getElementById('userAvatar');
    if (user && av) {
      av.textContent = (user.name || '').slice(0, 2).toUpperCase();
      av.title = `${user.name} - ${user.role || ''}`;
    }
    const logout = document.getElementById('logoutBtn');
    if (logout) {
      logout.addEventListener('click', (event) => {
        event.preventDefault();
        Auth.logout();
      });
    }
  }

  renderSidebar();
  applyAuthShell();
})();

