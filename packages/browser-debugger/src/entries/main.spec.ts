import { Observable } from '@datadog/browser-core'
import { registerCleanupTask, replaceMockableWithSpy } from '@datadog/browser-core/test'
import { initDebuggerTransport } from '../domain/api'
import { startDeliveryApiPolling } from '../domain/deliveryApi'
import { display } from '../domain/display'
import { startDebuggerBatch } from '../transport/startDebuggerBatch'
import type { BrowserWindow, DebuggerBuildMetadata, DebuggerInitConfiguration } from './main'
import { datadogDebugger } from './main'

const INIT_CONFIGURATION: DebuggerInitConfiguration = {
  clientToken: 'client-token',
  service: 'service-name',
  env: 'staging',
}
const DEBUG_ID = '01234567-89ab-cdef-0123-456789abcdef'

describe('datadogDebugger', () => {
  const browserWindow = window as BrowserWindow

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
    const { initTransportSpy, startDeliveryApiPollingSpy } = mockInitDependencies()

    datadogDebugger.init(INIT_CONFIGURATION)

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
    const { startDeliveryApiPollingSpy } = mockInitDependencies()
    const warnSpy = spyOn(display, 'warn')

    datadogDebugger.init({ ...INIT_CONFIGURATION, version: 'runtime-version' })

    await flushPromises()

    expect(warnSpy).toHaveBeenCalledWith(jasmine.stringMatching(/does not match the build-plugin version/))
    expect(startDeliveryApiPollingSpy).toHaveBeenCalledWith(jasmine.objectContaining({ version: 'runtime-version' }))
  })

  it('should leave the version unset when neither init nor build-plugin metadata define it', () => {
    browserWindow.__DD_LIVE_DEBUGGER_BUILD__ = { debugId: DEBUG_ID }
    const { initTransportSpy, startDeliveryApiPollingSpy } = mockInitDependencies()
    const warnSpy = spyOn(display, 'warn')

    datadogDebugger.init(INIT_CONFIGURATION)

    expect(initTransportSpy.calls.mostRecent().args[0].version).toBeUndefined()
    expect(startDeliveryApiPollingSpy.calls.mostRecent().args[0].version).toBeUndefined()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('should use the init version without warning when build-plugin metadata has no version', () => {
    browserWindow.__DD_LIVE_DEBUGGER_BUILD__ = { debugId: DEBUG_ID }
    const { startDeliveryApiPollingSpy } = mockInitDependencies()
    const warnSpy = spyOn(display, 'warn')

    datadogDebugger.init({ ...INIT_CONFIGURATION, version: 'runtime-version' })

    expect(startDeliveryApiPollingSpy).toHaveBeenCalledWith(jasmine.objectContaining({ version: 'runtime-version' }))
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('should pass the build-plugin debug ID to the Delivery API polling', () => {
    browserWindow.__DD_LIVE_DEBUGGER_BUILD__ = { version: 'build-version', debugId: DEBUG_ID }
    const { startDeliveryApiPollingSpy } = mockInitDependencies()

    datadogDebugger.init(INIT_CONFIGURATION)

    expect(startDeliveryApiPollingSpy).toHaveBeenCalledWith(jasmine.objectContaining({ debugId: DEBUG_ID }))
  })

  const invalidDebugIdCases: Array<{ description: string; metadata: unknown }> = [
    { description: 'there is no build-plugin metadata', metadata: undefined },
    { description: 'the build-plugin metadata has no debug ID', metadata: { version: 'build-version' } },
    { description: 'the build-plugin debug ID is an empty string', metadata: { debugId: '' } },
    { description: 'the build-plugin debug ID is not a string', metadata: { debugId: 123 } },
  ]
  invalidDebugIdCases.forEach(({ description, metadata }) => {
    it(`should not pass a debug ID to the Delivery API polling when ${description}`, () => {
      browserWindow.__DD_LIVE_DEBUGGER_BUILD__ = metadata as DebuggerBuildMetadata | undefined
      const { startDeliveryApiPollingSpy } = mockInitDependencies()

      datadogDebugger.init(INIT_CONFIGURATION)

      expect(startDeliveryApiPollingSpy).toHaveBeenCalledTimes(1)
      expect(startDeliveryApiPollingSpy.calls.mostRecent().args[0].debugId).toBeUndefined()
    })
  })
})

function mockInitDependencies() {
  replaceMockableWithSpy(startDebuggerBatch).and.callFake(() => ({
    flushObservable: new Observable(),
    prepareUrgentFlushObservable: new Observable(),
    isEmpty: false,
    add: () => undefined,
    flush: () => undefined,
    forceFlush: () => undefined,
    stop: () => undefined,
    upsert: () => undefined,
  }))
  const initTransportSpy = replaceMockableWithSpy(initDebuggerTransport)
  const startDeliveryApiPollingSpy = replaceMockableWithSpy(startDeliveryApiPolling)
  return { initTransportSpy, startDeliveryApiPollingSpy }
}

async function flushPromises() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
  }
}
