export const DEV_LOGS_URL = 'http://localhost:8080/datadog-logs.js'
export const DEV_RUM_URL = 'http://localhost:8080/datadog-rum.js'
export const DEV_RUM_SLIM_URL = 'http://localhost:8080/datadog-rum-slim.js'

export const INTAKE_DOMAINS = [
  'iam-rum-intake.datadoghq.com',
  'browser-intake-datad0g.com',
  'browser-intake-datadoghq.com',
  'browser-intake-datadoghq.eu',
  'browser-intake-ddog-gov.com',
  'browser-intake-us3-datadoghq.com',
  'browser-intake-us5-datadoghq.com',
  ...['com', 'eu'].flatMap((tld) => [
    `public-trace-http-intake.logs.datadoghq.${tld}`,
    `rum-http-intake.logs.datadoghq.${tld}`,
    `browser-http-intake.logs.datadoghq.${tld}`,
  ]),
]

export const enum PanelTabs {
  Events = 'events',
  Infos = 'infos',
  Settings = 'settings',
  Replay = 'replay',
}

export const DEFAULT_PANEL_TAB = PanelTabs.Events

export const SESSION_STORAGE_SETTINGS_KEY = '__ddBrowserSdkExtensionSettings'
