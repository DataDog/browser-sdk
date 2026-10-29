import { SKIPPED } from '@datadog/js-core/assembly'
import { registerCleanupTask } from '@datadog/browser-core/test'
import type { RumPlugin, RumPluginOnInitOptions } from '@datadog/browser-rum-core'
import type { BrowserWindow } from '../entries/main'
import { initDebuggerTransport, resetDebuggerTransport } from './api'
import { display } from './display'
import { onCatch, resetExceptionReplay, startExceptionReplay } from './exceptionReplay'
import { exceptionReplayPlugin } from './exceptionReplayPlugin'
import { clearProbes } from './probes'

type AssembleHook = Parameters<RumPluginOnInitOptions['registerAssembleEventHook']>[0]
type EventCollectedHook = Parameters<RumPluginOnInitOptions['registerEventCollectedHook']>[0]

describe('exceptionReplayPlugin', () => {
  let assembleHook: AssembleHook
  let eventCollectedHook: EventCollectedHook
  let batchAdd: jasmine.Spy

  function initPlugin({ isSessionTracked = true } = {}) {
    const registerAssembleEventHook = jasmine.createSpy('registerAssembleEventHook')
    const registerEventCollectedHook = jasmine.createSpy('registerEventCollectedHook')
    exceptionReplayPlugin().onInit({
      publicApi: { getInternalContext: () => (isSessionTracked ? {} : undefined) },
      registerAssembleEventHook,
      registerEventCollectedHook,
    })
    assembleHook = registerAssembleEventHook.calls.mostRecent().args[0]
    eventCollectedHook = registerEventCollectedHook.calls.mostRecent().args[0]
  }

  function assemble(eventType: string, error: unknown) {
    return assembleHook({ eventType, domainContext: { error } } as unknown as Parameters<AssembleHook>[0])
  }

  function collect(eventType: string, error: unknown) {
    eventCollectedHook({ eventType, domainContext: { error } } as unknown as Parameters<EventCollectedHook>[0])
  }

  function throwingFunction() {
    try {
      throw new Error('boom')
    } catch (e) {
      onCatch('src/throwing.ts;throwingFunction', e, undefined, {})
      throw e
    }
  }

  function catchError(fn: () => unknown): unknown {
    let error: unknown
    try {
      fn()
    } catch (e) {
      error = e
    }
    return error
  }

  beforeEach(() => {
    clearProbes()
    batchAdd = jasmine.createSpy('batchAdd')
    initDebuggerTransport({ service: 'test-service' } as any, { add: batchAdd } as any)
    ;(window as any).DD_DEBUGGER = { version: '0.0.1' }
    startExceptionReplay()

    registerCleanupTask(() => {
      delete (window as any).DD_DEBUGGER
      resetExceptionReplay()
      resetDebuggerTransport()
      clearProbes()
    })
  })

  it('should be compatible with the RUM Browser SDK plugin type', () => {
    const plugin: RumPlugin = exceptionReplayPlugin()

    expect(plugin.name).toBe('exception-replay')
  })

  it('should install the catch hook when initialized', () => {
    expect((window as BrowserWindow).$dd_catch).toBeUndefined()

    initPlugin()

    expect((window as BrowserWindow).$dd_catch).toBe(onCatch)
  })

  it('should link the snapshots of a reported error to its RUM event', () => {
    initPlugin()
    const error = catchError(throwingFunction)

    expect(assemble('error', error)).toEqual({
      type: 'error',
      error: { debug_info_captured: 'true' },
      _dd: {
        exception_replay: {
          exception_id: jasmine.any(String),
          frames: [{ index: 0, snapshot_id: jasmine.any(String) }],
        },
      },
    })
  })

  it('should send the snapshots once RUM collects the error event', () => {
    initPlugin()
    const error = catchError(throwingFunction)
    assemble('error', error)
    expect(batchAdd).not.toHaveBeenCalled()

    collect('error', error)

    expect(batchAdd).toHaveBeenCalledTimes(1)
  })

  it('should not capture errors in sessions that RUM does not track', () => {
    initPlugin({ isSessionTracked: false })
    const error = catchError(throwingFunction)

    expect(assemble('error', error)).toBe(SKIPPED)
  })

  it('should not start with a RUM Browser SDK that lacks the event collected hook', () => {
    const displaySpy = spyOn(display, 'warn')

    exceptionReplayPlugin().onInit({
      publicApi: { getInternalContext: () => ({}) },
      registerAssembleEventHook: jasmine.createSpy('registerAssembleEventHook'),
    })

    expect(displaySpy).toHaveBeenCalled()
    expect((window as BrowserWindow).$dd_catch).toBeUndefined()
  })

  it('should skip errors without snapshots', () => {
    initPlugin()

    expect(assemble('error', new Error('not thrown through instrumented code'))).toBe(SKIPPED)
  })

  it('should skip other event types', () => {
    initPlugin()
    const error = catchError(throwingFunction)

    expect(assemble('action', error)).toBe(SKIPPED)
  })
})
