import { resetExperimentalFeatures } from '../src/tools/experimentalFeatures'
import { resetValueHistoryGlobals } from '../src/tools/valueHistory'
import { resetFetchObservable } from '../src/browser/fetchObservable'
import { resetConsoleObservable } from '../src/domain/console/consoleObservable'
import { resetXhrObservable } from '../src/browser/xhrObservable'
import { resetGetCurrentSite } from '../src/browser/cookie'
import { resetReplayStats } from '../../rum/src/domain/replayStats'
import { resetInteractionCountPolyfill } from '../../rum-core/src/domain/view/viewMetrics/interactionCountPolyfill'
import { resetMonitor } from '../src/tools/monitor'
import { resetTelemetry } from '../src/domain/telemetry'
import { startLeakDetection } from './leakDetection'
import type { BuildEnvWindow } from './buildEnv'
;(window as unknown as BuildEnvWindow).__BUILD_ENV__SDK_VERSION__ = 'test'
;(window as any).IS_REACT_ACT_ENVIRONMENT = true

beforeEach(() => {
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
  resetGetCurrentSite()
  resetReplayStats()
  resetMonitor()
  resetTelemetry()
  resetInteractionCountPolyfill()
  resetExperimentalFeatures()
})

function clearAllCookies() {
  document.cookie.split(';').forEach((c) => {
    document.cookie = c.replace(/=.*/, `=;expires=${new Date(0).toUTCString()};path=/;samesite=strict`)
  })
}
