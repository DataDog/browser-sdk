import { datadogRum } from '@datadog/browser-rum'
import { datadogLogs } from '@datadog/browser-logs'
import { DEFAULT_PANEL_TAB } from '../common/panelTabConstants'
import { BASE_MONITORING_CONFIG, RUM_CONFIG } from '../common/monitoringConfig'

export function initMonitoring() {
  datadogRum.init({
    ...RUM_CONFIG,
    beforeSend: (event) => {
      // The feature-flags endpoint carries customer data (flag names/keys/tags) in its query string
      // (search/tags/value_type). Strip the query from its resource events so those values never
      // land in the extension's own RUM — the DOM is already masked for Session Replay.
      if (event.type === 'resource' && event.resource.url.includes('/api/ui/ffe/feature-flags')) {
        event.resource.url = event.resource.url.replace(/\?.*$/, '')
      }
      return true
    },
  })
  datadogRum.startSessionReplayRecording()
  datadogRum.startView(DEFAULT_PANEL_TAB)

  datadogLogs.init(BASE_MONITORING_CONFIG)
}
