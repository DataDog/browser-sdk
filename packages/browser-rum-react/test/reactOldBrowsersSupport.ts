import { instrumentMethod } from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'

export function initReactOldBrowsersSupport() {
  // TODO next major, bump browsers to versions supporting measureOptions and remove this instrumentation
  // see https://developer.mozilla.org/en-US/docs/Web/API/Performance/measure
  const instrumentation = instrumentMethod(performance, 'measure', ({ parameters }) => {
    if (typeof parameters[1] === 'object') {
      // remove unsupported parameters to avoid syntax errors
      parameters[1] = undefined
      parameters[2] = undefined
    }
  })

  registerCleanupTask(() => {
    instrumentation.stop()
  })
}
