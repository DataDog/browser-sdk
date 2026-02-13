// Vitest global setup — replaces packages/core/test/forEach.spec.ts
//
// This file runs before each test file in the browser context.
// It sets up the same global state that Karma's forEach.spec.ts provided.

import { beforeEach, afterEach } from 'vitest'
import { resetValueHistoryGlobals } from '../../packages/core/src/tools/valueHistory'
import { resetFetchObservable } from '../../packages/core/src/browser/fetchObservable'
import { resetConsoleObservable } from '../../packages/core/src/domain/console/consoleObservable'
import { resetXhrObservable } from '../../packages/core/src/browser/xhrObservable'
import { resetGetCurrentSite } from '../../packages/core/src/browser/cookie'
import { resetReplayStats } from '../../packages/rum/src/domain/replayStats'
import { resetInteractionCountPolyfill } from '../../packages/rum-core/src/domain/view/viewMetrics/interactionCountPolyfill'
import { resetMonitor } from '../../packages/core/src/tools/monitor'
import { resetTelemetry } from '../../packages/core/src/domain/telemetry'
import type { BuildEnvWindow } from '../../packages/core/test/buildEnv'

import { startLeakDetection } from '../../packages/core/test/leakDetection'

beforeEach(() => {
  ;(window as unknown as BuildEnvWindow).__BUILD_ENV__SDK_VERSION__ = 'test'
  ;(window as any).IS_REACT_ACT_ENVIRONMENT = true
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
})

function clearAllCookies() {
  document.cookie.split(';').forEach((c) => {
    document.cookie = c.replace(/=.*/, `=;expires=${new Date(0).toUTCString()};path=/;samesite=strict`)
  })
}
