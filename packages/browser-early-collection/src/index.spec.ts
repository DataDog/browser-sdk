import type { ProfilerInitOptions } from '@datadog/js-core/util'
import { noop } from '@datadog/js-core/util'
import { disableJasmineUncaughtExceptionTracking, registerCleanupTask } from '@datadog/browser-core/test'
import type { EarlyCollectionGlobalV1 } from './index'
import { startEarlyCollection } from './index'

describe('early collection', () => {
  beforeEach(() => {
    // The spec dispatches synthetic `error` and `unhandledrejection` events:
    // make sure Jasmine does not interpret them as test failures.
    disableJasmineUncaughtExceptionTracking()
  })

  function startAndCleanup(): EarlyCollectionGlobalV1 {
    startEarlyCollection()
    const earlyCollection = readEarlyCollection()!
    registerCleanupTask(() => {
      earlyCollection.stop()
      delete (window as { _DD_EARLY_COLLECTION?: unknown })._DD_EARLY_COLLECTION
    })
    return earlyCollection
  }

  function readEarlyCollection(): EarlyCollectionGlobalV1 | undefined {
    return (window as { _DD_EARLY_COLLECTION?: EarlyCollectionGlobalV1 })._DD_EARLY_COLLECTION
  }

  function dispatchError(error: unknown, message?: string) {
    window.dispatchEvent(new ErrorEvent('error', { error, message: message ?? 'fallback message' }))
  }

  function dispatchUnhandledRejection(reason: unknown) {
    window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { promise: Promise.resolve(), reason }))
  }

  /** Local Profiler mock: the package must stay standalone, so it cannot rely on other packages' test utils. */
  function mockProfilerConstructor(options: { throws?: boolean } = {}) {
    class MockProfiler {
      addEventListener = noop

      removeEventListener = noop

      readonly sampleInterval: number
      readonly initOptions: ProfilerInitOptions
      stopped = false

      constructor(initOptions: ProfilerInitOptions) {
        if (options.throws) {
          throw new Error('disabled by Document Policy')
        }
        this.sampleInterval = initOptions.sampleInterval
        this.initOptions = initOptions
      }

      stop(): Promise<unknown> {
        this.stopped = true
        return Promise.resolve({})
      }

      dispatchEvent(): boolean {
        return true
      }
    }

    const originalProfiler = (window as { Profiler?: unknown }).Profiler
    ;(window as { Profiler?: unknown }).Profiler = MockProfiler
    registerCleanupTask(() => {
      ;(window as { Profiler?: unknown }).Profiler = originalProfiler
    })
    return MockProfiler
  }

  it('publishes the handoff global with contract version 1', () => {
    const earlyCollection = startAndCleanup()

    expect(earlyCollection.version).toBe(1)
    expect(typeof earlyCollection.stop).toBe('function')
    expect(earlyCollection.buffer).toEqual([])
    expect(typeof earlyCollection.startClocks.relative).toBe('number')
    expect(typeof earlyCollection.startClocks.timeStamp).toBe('number')
  })

  it('buffers uncaught errors as raw data', () => {
    const earlyCollection = startAndCleanup()
    const error = new Error('boom')

    dispatchError(error)

    expect(earlyCollection.buffer.length).toBe(1)
    expect(earlyCollection.buffer[0][0]).toBe(0) // RUNTIME_ERROR entry type
    expect(typeof earlyCollection.buffer[0][1]).toBe('number')
    // Raw: the Error object itself, no stack parsing, no formatting.
    expect(earlyCollection.buffer[0][2]).toBe(error)
  })

  it('buffers the error message when the error event does not carry an Error', () => {
    const earlyCollection = startAndCleanup()

    dispatchError(undefined, 'Script error')

    expect(earlyCollection.buffer[0][2]).toBe('Script error')
  })

  it('buffers unhandled rejection reasons as raw data', () => {
    const earlyCollection = startAndCleanup()

    dispatchUnhandledRejection('oops')

    // The test runner also listens to `unhandledrejection` events and forwards
    // them to `window.onerror` with its own message, which the error handler
    // buffers as an additional entry: assert on the raw reason only.
    const oopsEntry = earlyCollection.buffer.find((entry) => entry[2] === 'oops')
    expect(oopsEntry?.[0]).toBe(0) // RUNTIME_ERROR entry type
    expect(typeof oopsEntry?.[1]).toBe('number')
  })

  it('starts a Profiler with the SDK tuning and publishes it', () => {
    const ProfilerConstructor = mockProfilerConstructor()
    const earlyCollection = startAndCleanup()

    const profiler = earlyCollection.profiler as InstanceType<typeof ProfilerConstructor>
    expect(profiler).toBeInstanceOf(ProfilerConstructor)
    expect(profiler.initOptions).toEqual({ sampleInterval: 10, maxBufferSize: 9000 })
    expect(profiler.stopped).toBe(false)
  })

  it('keeps collecting errors when the Profiler API is not available', () => {
    mockProfilerConstructor({ throws: true })
    const earlyCollection = startAndCleanup()

    expect(earlyCollection.profiler).toBeUndefined()
    dispatchError(new Error('boom'))
    expect(earlyCollection.buffer.length).toBe(1)
  })

  it('caps the buffer at 500 entries', () => {
    const earlyCollection = startAndCleanup()

    for (let i = 0; i < 501; i += 1) {
      dispatchError(new Error(`error ${i}`))
    }

    expect(earlyCollection.buffer.length).toBe(500)
    expect((earlyCollection.buffer[499][2] as Error).message).toBe('error 499')
  })

  it('stop() seals the buffer and is idempotent', () => {
    const earlyCollection = startAndCleanup()

    dispatchError(new Error('before'))
    earlyCollection.stop()
    earlyCollection.stop()
    dispatchError(new Error('after'))

    expect(earlyCollection.buffer.length).toBe(1)
    expect((earlyCollection.buffer[0][2] as Error).message).toBe('before')
  })
})
