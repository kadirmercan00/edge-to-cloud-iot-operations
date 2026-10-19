/* ============================================================
   EDGE-OPS AI — config.js
   Enterprise Industrial IoT Asset & Operations Platform
   ============================================================ */
'use strict';

const CONFIG = Object.freeze({
  // When running standalone or on GitHub Pages, MOCK_MODE generates high-fidelity telemetry
  MOCK_MODE:       true,
  APP_NAME:        'EDGE-OPS AI',
  APP_SUB:         'IoT Operations & Telemetry Platform',
  VERSION:         '1.0.0',

  // AWS API Gateway / Serverless Backend Endpoint Template
  API_BASE_URL:    'https://api.example.com/prod',
  ADMIN_API_URL:   'https://api.example.com/prod',
  MOBILE_API_URL:  'https://api.example.com/prod/mobile',
  API_KEY:         'DEMO-EDGE-OPS-GATEWAY-API-KEY',

  POLL_INTERVAL_MS: 10000,

  TOKEN_KEY:        'edge_ops_session_token',
  SESSION_DURATION_MS: 8 * 60 * 60 * 1000,

  DEMO_USERS: [
    { username: 'supervisor', password: 'supervisor123', name: 'Plant Supervisor', role: 'SUPERVISOR' },
    { username: 'operator',   password: 'operator123',   name: 'Field Technician', role: 'OPERATOR'   },
  ],

  SUPERVISOR_ROLES: ['SUPERVISOR'],
});
