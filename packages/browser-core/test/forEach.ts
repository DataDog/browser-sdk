import { stopMonitorErrorCollection } from '@datadog/js-core/monitor'
import { setDebugMode } from '@datadog/js-core/util'
import { resetAllowUntrustedEvents } from '@datadog/js-core/dom'
import { resetManageResourceTimingBufferFull } from '../../browser-rum-core/src/browser/performanceObservable'
import { resetWebSocketObservable } from '../../browser-rum-core/src/browser/webSocketObservable'
import { resetExperimentalFeatures } from '../src/tools/experimentalFeatures'
import { resetValueHistoryGlobals } from '../src/tools/valueHistory'
import { resetFetchObservable } from '../src/browser/fetchObservable'
import { resetConsoleObservable } from '../src/domain/console/consoleObservable'
import { resetXhrObservable } from '../src/browser/xhrObservable'
import { resetGetCurrentSite } from '../src/browser/cookie'
import { resetReplayStats } from '../../browser-rum/src/domain/replayStats'
import { resetInteractionCountPolyfill } from '../../browser-rum-core/src/domain/view/viewMetrics/interactionCountPolyfill'
import { resetTelemetry } from '../src/domain/telemetry'
import { resetSampleDecisionCache } from '../src/domain/sampler'
import { startLeakDetection } from './leakDetection'
import { registerCleanupTask } from './registerCleanupTask'
;(window as any).IS_REACT_ACT_ENVIRONMENT = true

beforeEach(() => {
  // Tests calling `history.pushState()` leave the shared page on another URL. Restore the full URL
  // (Vitest's includes `?sessionId=…&iframeId=…`), so a page reload still lands on the test runner.
  // Registered first, so it runs after the cleanup tasks of the test, which can change the URL too.
  const urlBeforeTest = location.href
  registerCleanupTask(() => {
    if (location.href !== urlBeforeTest) {
      history.replaceState(history.state, '', urlBeforeTest)
    }
  })
  // prevent 'Some of your tests did a full page reload!' issue
  window.onbeforeunload = () => 'stop'
  startLeakDetection()
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
  stopMonitorErrorCollection()
  setDebugMode(false)
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
