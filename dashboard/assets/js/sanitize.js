/* ============================================================
   EDGE-OPS AI — sanitize.js
   XSS koruması için HTML escape fonksiyonu
   ============================================================ */
'use strict';

function sanitize(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

const sanitizeStr = sanitize;

