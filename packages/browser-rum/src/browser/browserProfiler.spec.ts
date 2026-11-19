import { globalObject } from '@datadog/js-core/util'
import type { Profiler, ProfilerInitOptions, ProfilerTrace } from '@datadog/js-core/util'
import { display } from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { createBrowserProfiler } from './browserProfiler'

describe('browser profiler', () => {
  const configuration = { sampleIntervalMs: 10, collectIntervalMs: 60000 }
  const trace: ProfilerTrace = { resources: [], frames: [], stacks: [], samples: [] }
  let constructorSpy: jasmine.Spy
  let stopSpy: jasmine.Spy<() => Promise<ProfilerTrace>>
  let nativeProfilers: Profiler[]
  let warnSpy: jasmine.Spy

  beforeEach(() => {
    warnSpy = spyOn(display, 'warn')
    const originalProfiler = globalObject.Profiler
    registerCleanupTask(() => {
      globalObject.Profiler = originalProfiler
    })

    constructorSpy = jasmine.createSpy('Profiler')
    stopSpy = jasmine.createSpy('stop').and.returnValue(Promise.resolve(trace))
    nativeProfilers = []
    globalObject.Profiler = class extends EventTarget {
      readonly sampleInterval: number
      readonly stopped = false

      constructor(options: ProfilerInitOptions) {
        super()
        constructorSpy(options)
        this.sampleInterval = options.sampleInterval
        nativeProfilers.push(this)
      }

      stop(): Promise<ProfilerTrace> {
        return stopSpy()
      }
    }
  })

  it('sizes the native buffer from the sample and collection intervals', () => {
    const result = createBrowserProfiler(configuration, jasmine.createSpy())

    expect(result.status).toBe('success')
    expect(constructorSpy).toHaveBeenCalledWith({ sampleInterval: 10, maxBufferSize: 9000 })
  })

  it('notifies the caller when the native buffer fills', () => {
    const onBufferFull = jasmine.createSpy('onBufferFull')
    const result = createBrowserProfiler(configuration, onBufferFull)
    expect(result.status).toBe('success')

    nativeProfilers[0].dispatchEvent(new Event('samplebufferfull'))

    expect(onBufferFull).toHaveBeenCalledTimes(1)
  })

  it('removes the buffer listener and returns the trace when stopped', async () => {
    const onBufferFull = jasmine.createSpy('onBufferFull')
    const result = createBrowserProfiler(configuration, onBufferFull)
    if (result.status !== 'success') {
      fail('Expected profiler creation to succeed')
      return
    }

    expect(await result.profiler.stop()).toBe(trace)
    nativeProfilers[0].dispatchEvent(new Event('samplebufferfull'))

    expect(stopSpy).toHaveBeenCalledTimes(1)
    expect(onBufferFull).not.toHaveBeenCalled()
  })

  it('propagates trace collection failures to the caller', async () => {
    const result = createBrowserProfiler(configuration, jasmine.createSpy())
    if (result.status !== 'success') {
      fail('Expected profiler creation to succeed')
      return
    }
    const error = new Error('Trace collection failed')
    stopSpy.and.callFake(() => Promise.reject(error))

    await expectAsync(result.profiler.stop()).toBeRejectedWith(error)
  })

  it('reports when the browser does not support profiling', () => {
    globalObject.Profiler = undefined

    expect(createBrowserProfiler(configuration, jasmine.createSpy())).toEqual({
      status: 'error',
      reason: 'not-supported-by-browser',
    })
  })

  it('identifies a missing document policy', () => {
    const error = new Error('JS profiling is disabled by Document Policy')
    constructorSpy.and.throwError(error)

    expect(createBrowserProfiler(configuration, jasmine.createSpy())).toEqual({
      status: 'error',
      reason: 'missing-document-policy-header',
    })
    expect(warnSpy).toHaveBeenCalledWith(
      '[DD_RUM] Profiler startup failed. Ensure your server includes the `Document-Policy: js-profiling` response header when serving HTML pages.',
      error
    )
  })

  it('reports unexpected construction errors', () => {
    const error = new Error('Unexpected construction failure')
    constructorSpy.and.throwError(error)

    expect(createBrowserProfiler(configuration, jasmine.createSpy())).toEqual({
      status: 'error',
      reason: 'unexpected-exception',
    })
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
