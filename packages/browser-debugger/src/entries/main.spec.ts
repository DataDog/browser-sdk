import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Observable } from '@datadog/js-core/util'
import { registerCleanupTask, replaceMockableWithSpy } from '@datadog/browser-core/test'
import { initDebuggerTransport } from '../domain/api'
import { startDeliveryApiPolling } from '../domain/deliveryApi'
import { display } from '../domain/display'
import { registerExceptionReplayPlugin, resetExceptionReplay, startExceptionReplay } from '../domain/exceptionReplay'
import { addExceptionReplayPluginToRum } from '../domain/exceptionReplayPlugin'
import { startDebuggerBatch } from '../transport/startDebuggerBatch'
import type { BrowserWindow, DebuggerBuildMetadata, DebuggerInitConfiguration } from './main'
import { datadogDebugger } from './main'

const INIT_CONFIGURATION_WITHOUT_SERVICE: DebuggerInitConfiguration = {
  clientToken: 'client-token',
  env: 'staging',
  version: 'runtime-version',
}
const INIT_CONFIGURATION: DebuggerInitConfiguration = {
  ...INIT_CONFIGURATION_WITHOUT_SERVICE,
  service: 'service-name',
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
      resetExceptionReplay()
    })
  })

  it('should only expose init, version, and onReady', () => {
    expect(datadogDebugger).toEqual({
      init: expect.any(Function),
      version: expect.any(String),
      onReady: expect.any(Function),
    })
  })

  it('should start Exception Replay and add its plugin to RUM on init', () => {
    mockInitDependencies()
    const startExceptionReplaySpy = replaceMockableWithSpy(startExceptionReplay)
    const addExceptionReplayPluginToRumSpy = replaceMockableWithSpy(addExceptionReplayPluginToRum)

    datadogDebugger.init(INIT_CONFIGURATION)

    expect(startExceptionReplaySpy).toHaveBeenCalled()
    expect(addExceptionReplayPluginToRumSpy).toHaveBeenCalled()
  })

  it('should install the Exception Replay catch hook on init once the plugin is registered', () => {
    mockInitDependencies()
    registerExceptionReplayPlugin(() => true)

    datadogDebugger.init(INIT_CONFIGURATION)

    expect(browserWindow.$dd_catch).toBeDefined()
  })

  it('should not install the Exception Replay catch hook on init without the plugin', () => {
    mockInitDependencies()

    datadogDebugger.init(INIT_CONFIGURATION)

    expect(browserWindow.$dd_catch).toBeUndefined()
  })

  it('should pass the init version to the transport and the Delivery API polling', () => {
    const { initTransportSpy, startDeliveryApiPollingSpy } = mockInitDependencies()

    datadogDebugger.init(INIT_CONFIGURATION)

    expect(initTransportSpy).toHaveBeenCalledWith(
      expect.objectContaining({ version: 'runtime-version' }),
      expect.anything()
    )
    expect(startDeliveryApiPollingSpy).toHaveBeenCalledWith(expect.objectContaining({ version: 'runtime-version' }))
    expect(browserWindow.$dd_entry).toBeDefined()
    expect(browserWindow.$dd_return).toBeDefined()
    expect(browserWindow.$dd_throw).toBeDefined()
    expect(browserWindow.$dd_probes).toBeDefined()
  })

  it('should ignore a version in the build-plugin metadata of older builds', () => {
    const metadata: unknown = { version: 'build-version' }
    browserWindow.__DD_LIVE_DEBUGGER_BUILD__ = metadata as DebuggerBuildMetadata
    const { startDeliveryApiPollingSpy } = mockInitDependencies()
    const warnSpy = vi.spyOn(display, 'warn').mockReturnValue(undefined)

    datadogDebugger.init(INIT_CONFIGURATION)

    expect(startDeliveryApiPollingSpy).toHaveBeenCalledWith(expect.objectContaining({ version: 'runtime-version' }))
    expect(warnSpy).not.toHaveBeenCalled()
  })

  const missingVersionCases: Array<{ description: string; version: unknown }> = [
    { description: 'init has no version', version: undefined },
    { description: 'the init version is an empty string', version: '' },
    { description: 'the init version is not a string', version: 123 },
  ]
  missingVersionCases.forEach(({ description, version }) => {
    it(`should report a missing version and not start when ${description}`, () => {
      const metadata: unknown = { version: 'build-version' }
      browserWindow.__DD_LIVE_DEBUGGER_BUILD__ = metadata as DebuggerBuildMetadata
      const { startDebuggerBatchSpy, initTransportSpy, startDeliveryApiPollingSpy } = mockInitDependencies()
      const errorSpy = vi.spyOn(display, 'error').mockReturnValue(undefined)
      const configuration: unknown = { ...INIT_CONFIGURATION, version }

      datadogDebugger.init(configuration as DebuggerInitConfiguration)

      expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
        '"version" is required. Set it in init() to the version the Datadog build plugin uploads symbols under (its `metadata.version` option).'
      )
      expect(startDebuggerBatchSpy).not.toHaveBeenCalled()
      expect(initTransportSpy).not.toHaveBeenCalled()
      expect(startDeliveryApiPollingSpy).not.toHaveBeenCalled()
      expect(browserWindow.$dd_entry).toBeUndefined()
    })
  })

  it('should default the init service from build-plugin metadata', () => {
    browserWindow.__DD_LIVE_DEBUGGER_BUILD__ = { service: 'build-service' }
    const { startDebuggerBatchSpy, initTransportSpy, startDeliveryApiPollingSpy } = mockInitDependencies()
    const warnSpy = vi.spyOn(display, 'warn').mockReturnValue(undefined)

    datadogDebugger.init(INIT_CONFIGURATION_WITHOUT_SERVICE)

    expect(startDebuggerBatchSpy).toHaveBeenCalledWith(expect.objectContaining({ service: 'build-service' }))
    expect(initTransportSpy).toHaveBeenCalledWith(
      expect.objectContaining({ service: 'build-service' }),
      expect.anything()
    )
    expect(startDeliveryApiPollingSpy).toHaveBeenCalledWith(expect.objectContaining({ service: 'build-service' }))
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('should use the explicit init service and warn when it mismatches build-plugin metadata', () => {
    browserWindow.__DD_LIVE_DEBUGGER_BUILD__ = { service: 'build-service' }
    const { initTransportSpy, startDeliveryApiPollingSpy } = mockInitDependencies()
    const warnSpy = vi.spyOn(display, 'warn').mockReturnValue(undefined)

    datadogDebugger.init({ ...INIT_CONFIGURATION, service: 'runtime-service' })

    expect(warnSpy).toHaveBeenCalledExactlyOnceWith(
      'init service "runtime-service" does not match the build-plugin service "build-service". Using the init service.'
    )
    expect(initTransportSpy).toHaveBeenCalledWith(
      expect.objectContaining({ service: 'runtime-service' }),
      expect.anything()
    )
    expect(startDeliveryApiPollingSpy).toHaveBeenCalledWith(expect.objectContaining({ service: 'runtime-service' }))
  })

  const invalidBuildServiceCases: Array<{ description: string; metadata: unknown }> = [
    { description: 'there is no build-plugin metadata', metadata: undefined },
    { description: 'the build-plugin metadata has no service', metadata: { version: 'build-version' } },
    { description: 'the build-plugin service is an empty string', metadata: { service: '' } },
    { description: 'the build-plugin service is not a string', metadata: { service: 123 } },
  ]
  invalidBuildServiceCases.forEach(({ description, metadata }) => {
    it(`should use the init service without warning when ${description}`, () => {
      browserWindow.__DD_LIVE_DEBUGGER_BUILD__ = metadata as DebuggerBuildMetadata | undefined
      const { startDeliveryApiPollingSpy } = mockInitDependencies()
      const warnSpy = vi.spyOn(display, 'warn').mockReturnValue(undefined)

      datadogDebugger.init(INIT_CONFIGURATION)

      expect(startDeliveryApiPollingSpy).toHaveBeenCalledWith(expect.objectContaining({ service: 'service-name' }))
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it(`should report a missing service and not start when init has no service and ${description}`, () => {
      browserWindow.__DD_LIVE_DEBUGGER_BUILD__ = metadata as DebuggerBuildMetadata | undefined
      const { startDebuggerBatchSpy, initTransportSpy, startDeliveryApiPollingSpy } = mockInitDependencies()
      const errorSpy = vi.spyOn(display, 'error').mockReturnValue(undefined)

      datadogDebugger.init(INIT_CONFIGURATION_WITHOUT_SERVICE)

      expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
        '"service" is required. Set it in init() or with the `metadata.service` option of the Datadog build plugin.'
      )
      expect(startDebuggerBatchSpy).not.toHaveBeenCalled()
      expect(initTransportSpy).not.toHaveBeenCalled()
      expect(startDeliveryApiPollingSpy).not.toHaveBeenCalled()
      expect(browserWindow.$dd_entry).toBeUndefined()
    })
  })

  it('should pass the build-plugin debug ID to the Delivery API polling', () => {
    browserWindow.__DD_LIVE_DEBUGGER_BUILD__ = { debugId: DEBUG_ID }
    const { startDeliveryApiPollingSpy } = mockInitDependencies()

    datadogDebugger.init(INIT_CONFIGURATION)

    expect(startDeliveryApiPollingSpy).toHaveBeenCalledWith(expect.objectContaining({ debugId: DEBUG_ID }))
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
      expect(startDeliveryApiPollingSpy.mock.lastCall![0].debugId).toBeUndefined()
    })
  })
})

function mockInitDependencies() {
  const startDebuggerBatchSpy = replaceMockableWithSpy(startDebuggerBatch).mockImplementation(() => ({
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
  return { startDebuggerBatchSpy, initTransportSpy, startDeliveryApiPollingSpy }
}
