import { datadogRum } from '@datadog/browser-rum'
import { datadogLogs } from '@datadog/browser-logs'
import { DEFAULT_PANEL_TAB } from '../common/panelTabConstants'
import { BASE_MONITORING_CONFIG } from '../common/monitoringConfig'

export function initMonitoring() {
  datadogRum.init({
    ...BASE_MONITORING_CONFIG,
    applicationId: '235202fa-3da1-4aeb-abc4-d01b10ca1539',
    sessionReplaySampleRate: 100,
    trackUserInteractions: true,
    trackViewsManually: true,
    trackResources: true,
    trackLongTasks: true,
    defaultPrivacyLevel: 'mask',
  })
  datadogRum.startSessionReplayRecording()
  datadogRum.startView(DEFAULT_PANEL_TAB)

  datadogLogs.init({
    ...BASE_MONITORING_CONFIG,
    forwardErrorsToLogs: true,
    forwardConsoleLogs: 'all',
    forwardReports: 'all',
  })
}
