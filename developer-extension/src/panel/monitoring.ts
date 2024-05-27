import { datadogRum } from '@datadog/browser-rum'
import { datadogLogs } from '@datadog/browser-logs'
import packageJson from '../../package.json'
import { DEFAULT_PANEL_TAB } from '../common/constants'

export function initMonitoring() {
  datadogRum.init({
    clientToken: 'pub74fd472504982beb427b647893758040',
    sessionSampleRate: 100,
    telemetrySampleRate: 100,
    allowFallbackToLocalStorage: true,
    site: 'datadoghq.com',
    service: 'browser-sdk-developer-extension',
    env: 'prod',
    version: packageJson.version,
    applicationId: '235202fa-3da1-4aeb-abc4-d01b10ca1539',
    defaultPrivacyLevel: 'mask',
    sessionReplaySampleRate: 100,
    trackUserInteractions: true,
    trackViewsManually: true,
    trackResources: true,
    trackLongTasks: true,
  })
  datadogRum.startSessionReplayRecording()
  datadogRum.startView(DEFAULT_PANEL_TAB)

  datadogLogs.init({
    clientToken: 'pub74fd472504982beb427b647893758040',
    sessionSampleRate: 100,
    telemetrySampleRate: 100,
    allowFallbackToLocalStorage: true,
    site: 'datadoghq.com',
    service: 'browser-sdk-developer-extension',
    env: 'prod',
    version: packageJson.version,
    forwardErrorsToLogs: true,
    forwardConsoleLogs: 'all',
    forwardReports: 'all',
  })
}
