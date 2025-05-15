import { flashcatRum } from '@flashcatcloud/browser-rum'
import { flashcatLogs } from '@flashcatcloud/browser-logs'
import packageJson from '../../package.json'
import { DEFAULT_PANEL_TAB } from '../common/panelTabConstants'

export function initMonitoring() {
  flashcatRum.init({
    applicationId: '235202fa-3da1-4aeb-abc4-d01b10ca1539',
    clientToken: 'pub74fd472504982beb427b647893758040',
    service: 'browser-sdk-developer-extension',
    env: 'prod',
    version: packageJson.version,
    sessionPersistence: 'local-storage',
    sessionSampleRate: 100,
    sessionReplaySampleRate: 100,
    telemetrySampleRate: 100,
    trackUserInteractions: true,
    trackViewsManually: true,
    trackResources: true,
    trackLongTasks: true,
    defaultPrivacyLevel: 'mask',
  })
  flashcatRum.startSessionReplayRecording()
  flashcatRum.startView(DEFAULT_PANEL_TAB)

  flashcatLogs.init({
    clientToken: 'pub74fd472504982beb427b647893758040',
    service: 'browser-sdk-developer-extension',
    env: 'prod',
    version: packageJson.version,
    sessionPersistence: 'local-storage',
    forwardErrorsToLogs: true,
    forwardConsoleLogs: 'all',
    forwardReports: 'all',
    sessionSampleRate: 100,
    telemetrySampleRate: 100,
  })
}
