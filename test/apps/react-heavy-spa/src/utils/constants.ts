// Data file paths
export const DATA_PATHS = {
  DASHBOARD: '/data/metrics.json',
  LOGS: '/data/logs.json',
  TRACES: '/data/traces.json',
  INFRASTRUCTURE: '/data/infrastructure.json',
} as const

// Route paths
export const ROUTES = {
  DASHBOARD: '/',
  LOGS: '/logs',
  APM_TRACES: '/apm/traces',
  INFRASTRUCTURE: '/infrastructure',
  SETTINGS: '/settings',
  TEST: '/test',
} as const

// UI Constants
export const SIDEBAR_WIDTH = 240
export const TOPBAR_HEIGHT = 64
export const LOG_TABLE_ROW_HEIGHT = 48
export const ITEMS_PER_PAGE = 50
