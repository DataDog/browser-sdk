import { globalObject } from '@datadog/js-core/util'
import { defineGlobal } from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import type { RumPublicApi } from '@datadog/browser-rum-core'
import { datadogRum } from './salesforce'

describe('full salesforce entrypoint', () => {
  it('exposes the RUM API as DD_RUM', () => {
    const browserWindow = globalObject as { DD_RUM?: RumPublicApi }
    const previousDdRum = browserWindow.DD_RUM
    registerCleanupTask(() => defineGlobal(browserWindow, 'DD_RUM', previousDdRum))

    delete browserWindow.DD_RUM
    defineGlobal(browserWindow, 'DD_RUM', datadogRum)

    expect(browserWindow.DD_RUM!).toBe(datadogRum)
  })
})
