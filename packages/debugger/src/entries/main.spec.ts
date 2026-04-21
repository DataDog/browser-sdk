import { display } from '@datadog/browser-core'
import { registerCleanupTask, replaceMockableWithSpy } from '@datadog/browser-core/test'
import { initDebuggerTransport } from '../domain/api'
import { startDeliveryApiPolling } from '../domain/deliveryApi'
import { startDebuggerBatch } from '../transport/startDebuggerBatch'
import type { BrowserWindow } from './main'
import { datadogDebugger } from './main'

describe('datadogDebugger', () => {
  const browserWindow: BrowserWindow = window

  beforeEach(() => {
    delete browserWindow.__DD_LIVE_DEBUGGER_BUILD__
    delete browserWindow.$dd_entry
    delete browserWindow.$dd_return
    delete browserWindow.$dd_throw
    delete browserWindow.$dd_probes

    registerCleanupTask(() => {
      delete browserWindow.__DD_LIVE_DEBUGGER_BUILD__
      delete browserWindow.$dd_entry
      delete browserWindow.$dd_return
      delete browserWindow.$dd_throw
      delete browserWindow.$dd_probes
    })
  })

  it('should only expose init, version, and onReady', () => {
    expect(datadogDebugger).toEqual({
      init: jasmine.any(Function),
      version: jasmine.any(String),
      onReady: jasmine.any(Function),
    })
  })

  it('should default the init version from build-plugin metadata', async () => {
    browserWindow.__DD_LIVE_DEBUGGER_BUILD__ = { version: 'build-version' }
    replaceMockableWithSpy(startDebuggerBatch).and.callFake(() => ({
      flushController: undefined as any,
      add: () => undefined,
      flush: () => undefined,
      stop: () => undefined,
      upsert: () => undefined,
    }))
    const initTransportSpy = replaceMockableWithSpy(initDebuggerTransport)
    const startDeliveryApiPollingSpy = replaceMockableWithSpy(startDeliveryApiPolling)

    datadogDebugger.init({
      applicationId: 'app-id',
      clientToken: 'client-token',
      service: 'service-name',
      env: 'staging',
    })

    await flushPromises()

    expect(initTransportSpy).toHaveBeenCalledWith(
      jasmine.objectContaining({ version: 'build-version' }),
      jasmine.anything()
    )
    expect(startDeliveryApiPollingSpy).toHaveBeenCalledWith(jasmine.objectContaining({ version: 'build-version' }))
    expect(browserWindow.$dd_entry).toBeDefined()
    expect(browserWindow.$dd_return).toBeDefined()
    expect(browserWindow.$dd_throw).toBeDefined()
    expect(browserWindow.$dd_probes).toBeDefined()
  })

  it('should warn when the explicit init version mismatches build-plugin metadata', async () => {
    browserWindow.__DD_LIVE_DEBUGGER_BUILD__ = { version: 'build-version' }
    replaceMockableWithSpy(startDebuggerBatch).and.callFake(() => ({
      flushController: undefined as any,
      add: () => undefined,
      flush: () => undefined,
      stop: () => undefined,
      upsert: () => undefined,
    }))
    replaceMockableWithSpy(initDebuggerTransport)
    const startDeliveryApiPollingSpy = replaceMockableWithSpy(startDeliveryApiPolling)
    const warnSpy = spyOn(display, 'warn')

    datadogDebugger.init({
      applicationId: 'app-id',
      clientToken: 'client-token',
      service: 'service-name',
      env: 'staging',
      version: 'runtime-version',
    })

    await flushPromises()

    expect(warnSpy).toHaveBeenCalledWith(jasmine.stringMatching(/does not match the build-plugin version/))
    expect(startDeliveryApiPollingSpy).toHaveBeenCalledWith(jasmine.objectContaining({ version: 'runtime-version' }))
  })
})

async function flushPromises() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
  }
}
