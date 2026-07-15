import { defineGlobal, globalObject } from '@datadog/browser-core'
import type { RumPublicApi } from '@datadog/browser-rum-core'
import { datadogRum } from './salesforce'

describe('salesforce entrypoint', () => {
  it('exposes the RUM API as DD_RUM', () => {
    const browserWindow = globalObject as { DD_RUM?: RumPublicApi }

    delete browserWindow.DD_RUM
    defineGlobal(browserWindow, 'DD_RUM', datadogRum)

    expect(browserWindow.DD_RUM!).toBe(datadogRum)
  })

  it('keeps the standard public API shape', () => {
    expect(datadogRum.version).toEqual(jasmine.any(String))
    expect(datadogRum.onReady).toEqual(jasmine.any(Function))
    expect(datadogRum.init).toEqual(jasmine.any(Function))
  })
})
