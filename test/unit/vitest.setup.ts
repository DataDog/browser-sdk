import { beforeEach, afterEach } from 'vitest'
import { resetAllowUntrustedEvents } from '../../packages/browser-core/src/browser/addEventListener'
import { resetGetCurrentSite } from '../../packages/browser-core/src/browser/cookie'
import { resetValueHistoryGlobals } from '../../packages/browser-core/src/tools/valueHistory'
import { resetFetchObservable } from '../../packages/browser-core/src/browser/fetchObservable'
import { resetWebSocketObservable } from '../../packages/browser-core/src/browser/webSocketObservable'
import { resetConsoleObservable } from '../../packages/browser-core/src/domain/console/consoleObservable'
import { resetXhrObservable } from '../../packages/browser-core/src/browser/xhrObservable'
import { resetSampleDecisionCache } from '../../packages/browser-core/src/domain/sampler'
import { resetReplayStats } from '../../packages/browser-rum/src/domain/replayStats'
import { resetManageResourceTimingBufferFull } from '../../packages/browser-rum-core/src/browser/performanceObservable'
import { resetInteractionCountPolyfill } from '../../packages/browser-rum-core/src/domain/view/viewMetrics/interactionCountPolyfill'
import { resetMonitor } from '../../packages/browser-core/src/tools/monitor'
import { resetTelemetry } from '../../packages/browser-core/src/domain/telemetry'
import { resetExperimentalFeatures } from '../../packages/browser-core/src/tools/experimentalFeatures'
import { ignoreConsoleLogs, startLeakDetection } from '../../packages/browser-core/test'

beforeEach(() => {
  ;(window as any).IS_REACT_ACT_ENVIRONMENT = true
  // prevent 'Some of your tests did a full page reload!' issue
  window.onbeforeunload = () => 'stop'
  startLeakDetection()
  ignoreConsoleLogs('warn', 'using an outdated JSX transform')
  // Note: clearing cookies should be done in `beforeEach` rather than `afterEach`, because in some
  // cases the test patches the `document.cookie` getter (ex: `spyOnProperty(document, 'cookie',
  // 'get')`), which would prevent the `clearAllCookies` function from working properly.
  clearAllCookies()
})

afterEach(() => {
  // reset globals
  delete (window as any).DD_LOGS
  delete (window as any).DD_RUM
  resetValueHistoryGlobals()
  resetFetchObservable()
  resetConsoleObservable()
  resetXhrObservable()
  resetWebSocketObservable()
  resetGetCurrentSite()
  resetReplayStats()
  resetMonitor()
  resetTelemetry()
  resetInteractionCountPolyfill()
  resetSampleDecisionCache()
  resetExperimentalFeatures()
  resetManageResourceTimingBufferFull()
  resetAllowUntrustedEvents()
})

function clearAllCookies() {
  document.cookie.split(';').forEach((c) => {
    document.cookie = c.replace(/=.*/, `=;expires=${new Date(0).toUTCString()};path=/;samesite=strict`)
  })
}
