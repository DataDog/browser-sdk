import { datadogRum } from '@datadog/browser-rum'
import { datadogLogs } from '@datadog/browser-logs'
import { DEFAULT_PANEL_TAB } from '../common/panelTabConstants'
import { BASE_MONITORING_CONFIG, RUM_CONFIG } from '../common/monitoringConfig'

export function initMonitoring() {
  datadogRum.init(RUM_CONFIG)
  datadogRum.startSessionReplayRecording()
  datadogRum.startView(DEFAULT_PANEL_TAB)

  datadogLogs.init(BASE_MONITORING_CONFIG)
}
