import { openobserveRum } from '@openobserve/browser-rum'
import { openobserveLogs } from '@openobserve/browser-logs'
import { DEFAULT_PANEL_TAB } from '../common/panelTabConstants'
import { BASE_MONITORING_CONFIG, RUM_CONFIG } from '../common/monitoringConfig'

export function initMonitoring() {
  openobserveRum.init(RUM_CONFIG)
  openobserveRum.startSessionReplayRecording()
  openobserveRum.startView(DEFAULT_PANEL_TAB)

  openobserveLogs.init(BASE_MONITORING_CONFIG)
}
