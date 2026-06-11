import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest'
import type { GlobalObject } from '@datadog/browser-core'
import { globalObject } from '@datadog/browser-core'
import { registerCleanupTask, mockClock, replaceMockable } from '@datadog/browser-core/test'
import type { Clock } from '@datadog/browser-core/test'
import { display } from './display'
import { getProbes, getAllProbes, clearProbes } from './probes'
import {
  buildDeliveryApiUrl,
  startDeliveryApiPolling,
  stopDeliveryApiPolling,
  clearDeliveryApiState,
} from './deliveryApi'
import type { DeliveryApiConfiguration } from './deliveryApi'
import { createProbe } from './probe.specHelper'

const DEFAULT_PROBE_FUNCTION_ID = 'test.js;testMethod'

describe('buildDeliveryApiUrl', () => {
  it('should default to datadoghq.com', () => {
    expect(buildDeliveryApiUrl()).toBe('https://api.datadoghq.com/api/unstable/debugger/frontend/probes')
  })

  it('should build URL for US1 site', () => {
    expect(buildDeliveryApiUrl('datadoghq.com')).toBe('https://api.datadoghq.com/api/unstable/debugger/frontend/probes')
  })

  it('should build URL for EU1 site', () => {
    expect(buildDeliveryApiUrl('datadoghq.eu')).toBe('https://api.datadoghq.eu/api/unstable/debugger/frontend/probes')
  })

  it('should build URL for US3 site', () => {
    expect(buildDeliveryApiUrl('us3.datadoghq.com')).toBe(
      'https://api.us3.datadoghq.com/api/unstable/debugger/frontend/probes'
    )
  })

  it('should build URL for staging site', () => {
    expect(buildDeliveryApiUrl('datad0g.com')).toBe('https://api.datad0g.com/api/unstable/debugger/frontend/probes')
  })

  it('should build URL for gov site', () => {
    expect(buildDeliveryApiUrl('ddog-gov.com')).toBe('https://api.ddog-gov.com/api/unstable/debugger/frontend/probes')
  })

  it('should use proxy as origin when provided', () => {
    expect(buildDeliveryApiUrl('datadoghq.com', 'http://localhost:9000')).toBe(
      'http://localhost:9000/api/unstable/debugger/frontend/probes'
    )
  })

  it('should ignore site when proxy is provided', () => {
    expect(buildDeliveryApiUrl('datadoghq.eu', 'http://proxy.example.com')).toBe(
      'http://proxy.example.com/api/unstable/debugger/frontend/probes'
    )
  })

  it('should trim a trailing slash from a proxy origin to avoid a double-slash path', () => {
    expect(buildDeliveryApiUrl('datadoghq.com', 'https://proxy.example.com/')).toBe(
      'https://proxy.example.com/api/unstable/debugger/frontend/probes'
    )
  })

  it('should trim a trailing slash from a proxy that has a sub-path', () => {
    expect(buildDeliveryApiUrl('datadoghq.com', 'https://proxy.example.com/dd/')).toBe(
      'https://proxy.example.com/dd/api/unstable/debugger/frontend/probes'
    )
  })

  it('should preserve a proxy sub-path that has no trailing slash', () => {
    expect(buildDeliveryApiUrl('datadoghq.com', 'https://proxy.example.com/dd')).toBe(
      'https://proxy.example.com/dd/api/unstable/debugger/frontend/probes'
    )
  })
})

describe('deliveryApi', () => {
  let fetchSpy: Mock
  let errorSpy: Mock
  let warnSpy: Mock
  let clock: Clock

  function makeConfig(overrides: Partial<DeliveryApiConfiguration> = {}): DeliveryApiConfiguration {
    return {
      service: 'test-service',
      clientToken: 'test-client-token',
      env: 'staging',
      version: '1.0.0',
      pollInterval: 5000,
      ...overrides,
    }
  }

  function respondWith(data: object, status = 200) {
    fetchSpy.mockReturnValue(
      Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(data),
        text: () => Promise.resolve(JSON.stringify(data)),
      })
    )
  }

  beforeEach(() => {
    clock = mockClock()
    clearProbes()
    clearDeliveryApiState()
    fetchSpy = vi.spyOn(window, 'fetch')
    errorSpy = vi.spyOn(display, 'error')
    warnSpy = vi.spyOn(display, 'warn')
    respondWith({ nextCursor: '', updates: [], deletions: [] })

    registerCleanupTask(() => {
      stopDeliveryApiPolling()
      clearDeliveryApiState()
      clearProbes()
    })
  })

  describe('startDeliveryApiPolling', () => {
    it('should not start polling when location is not available', () => {
      replaceMockable(globalObject, {} as GlobalObject)
      startDeliveryApiPolling(makeConfig())
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('should make an initial POST request to the delivery API', () => {
      startDeliveryApiPolling(makeConfig())

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [url, options] = fetchSpy.mock.lastCall!
      expect(url).toBe('https://api.datadoghq.com/api/unstable/debugger/frontend/probes')
      expect(options.method).toBe('POST')
      expect(options.credentials).toBeUndefined()
      expect(options.headers['Content-Type']).toBe('application/json; charset=utf-8')
      expect(options.headers['Accept']).toBe('application/vnd.datadog.debugger-probes+json; version=1')
      expect(options.headers['dd-client-token']).toBe('test-client-token')
    })

    it('should use the configured site for the request URL', () => {
      startDeliveryApiPolling(makeConfig({ site: 'datadoghq.eu' }))

      const [url] = fetchSpy.mock.lastCall!
      expect(url).toBe('https://api.datadoghq.eu/api/unstable/debugger/frontend/probes')
    })

    it('should send the correct request body', () => {
      startDeliveryApiPolling(makeConfig())

      const [, options] = fetchSpy.mock.lastCall!
      const body = JSON.parse(options.body)
      expect(body).toEqual({
        service: 'test-service',
        clientName: 'browser',
        clientVersion: expect.stringMatching(/.+/),
        env: 'staging',
        serviceVersion: '1.0.0',
      })
    })

    it('should not include nextCursor in the first request', () => {
      startDeliveryApiPolling(makeConfig())

      const [, options] = fetchSpy.mock.lastCall!
      const body = JSON.parse(options.body)
      expect(body.nextCursor).toBeUndefined()
    })

    it('should warn if polling is already started', () => {
      startDeliveryApiPolling(makeConfig())
      startDeliveryApiPolling(makeConfig())

      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/already started/))
    })

    it('should add probes from the updates array', async () => {
      const probe = createProbe()

      respondWith({
        nextCursor: 'cursor-1',
        updates: [probe],
        deletions: [],
      })

      startDeliveryApiPolling(makeConfig())
      await flushPromises()

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)
      expect(probes).toBeDefined()
      expect(probes!.length).toBe(1)
      expect(probes![0].id).toBe(probe.id)
    })

    it('should ignore log probes without a method location', async () => {
      respondWith({
        nextCursor: 'cursor-1',
        updates: [
          createProbe({
            where: {
              sourceFile: 'test.js',
              lines: ['16'],
            },
          }),
        ],
        deletions: [],
      })

      startDeliveryApiPolling(makeConfig())
      await flushPromises()

      expect(getAllProbes()).toEqual([])
    })

    it('should ignore log probes without a where clause', async () => {
      respondWith({
        nextCursor: 'cursor-1',
        updates: [{ ...createProbe(), where: undefined }],
        deletions: [],
      })

      startDeliveryApiPolling(makeConfig())
      await flushPromises()

      expect(errorSpy).not.toHaveBeenCalled()
    })

    it('should ignore non-log probes without requiring a method location', async () => {
      respondWith({
        nextCursor: 'cursor-1',
        updates: [{ id: 'metric-probe', version: 1, type: 'METRIC_PROBE' }],
        deletions: [],
      })

      startDeliveryApiPolling(makeConfig())
      await flushPromises()

      expect(getProbes(DEFAULT_PROBE_FUNCTION_ID)).toBeUndefined()
      expect(errorSpy).not.toHaveBeenCalled()
    })

    it('should remove probes listed in deletions', async () => {
      const probe = createProbe()

      // First poll: add the probe via the delivery API
      respondWith({
        nextCursor: 'cursor-1',
        updates: [probe],
        deletions: [],
      })

      startDeliveryApiPolling(makeConfig())
      await flushPromises()
      expect(getProbes(DEFAULT_PROBE_FUNCTION_ID)).toBeDefined()

      // Second poll: delete it
      respondWith({
        nextCursor: 'cursor-2',
        updates: [],
        deletions: [probe.id],
      })

      clock.tick(5000)
      await flushPromises()

      expect(getProbes(DEFAULT_PROBE_FUNCTION_ID)).toBeUndefined()
    })

    it('should send nextCursor in subsequent requests', async () => {
      respondWith({
        nextCursor: 'cursor-abc',
        updates: [],
        deletions: [],
      })

      startDeliveryApiPolling(makeConfig())
      await flushPromises()

      // Tick to trigger next poll
      respondWith({ nextCursor: 'cursor-def', updates: [], deletions: [] })
      clock.tick(5000)

      expect(fetchSpy).toHaveBeenCalledTimes(2)
      const [, options] = fetchSpy.mock.lastCall!
      const body = JSON.parse(options.body)
      expect(body.nextCursor).toBe('cursor-abc')
    })

    it('should update existing probes when they appear in updates again', async () => {
      respondWith({
        nextCursor: 'cursor-1',
        updates: [createProbe({ version: 1 })],
        deletions: [],
      })

      startDeliveryApiPolling(makeConfig())
      await flushPromises()

      respondWith({
        nextCursor: 'cursor-2',
        updates: [createProbe({ version: 2 })],
        deletions: [],
      })

      clock.tick(5000)
      await flushPromises()

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)
      expect(probes).toBeDefined()
      expect(probes!.length).toBe(1)
      expect(probes![0].version).toBe(2)
    })

    it('should log an error when the response is not ok', async () => {
      respondWith({}, 500)

      startDeliveryApiPolling(makeConfig())
      await flushPromises()

      expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/failed with status 500/), expect.any(String))
    })

    it('should log an error when fetch throws', async () => {
      fetchSpy.mockReturnValue(Promise.reject(new Error('network error')))

      startDeliveryApiPolling(makeConfig())
      await flushPromises()

      expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/poll error/), expect.any(Error))
    })

    it('should poll at the configured interval', () => {
      respondWith({ nextCursor: '', updates: [], deletions: [] })

      startDeliveryApiPolling(makeConfig({ pollInterval: 3000 }))
      expect(fetchSpy).toHaveBeenCalledTimes(1)

      clock.tick(3000)
      expect(fetchSpy).toHaveBeenCalledTimes(2)

      clock.tick(3000)
      expect(fetchSpy).toHaveBeenCalledTimes(3)
    })

    it('should default to 60 second polling interval', () => {
      respondWith({ nextCursor: '', updates: [], deletions: [] })

      startDeliveryApiPolling(makeConfig({ pollInterval: undefined }))
      expect(fetchSpy).toHaveBeenCalledTimes(1)

      clock.tick(59_999)
      expect(fetchSpy).toHaveBeenCalledTimes(1)

      clock.tick(1)
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })
  })

  describe('stopDeliveryApiPolling', () => {
    it('should stop the polling interval', () => {
      respondWith({ nextCursor: '', updates: [], deletions: [] })

      startDeliveryApiPolling(makeConfig())
      expect(fetchSpy).toHaveBeenCalledTimes(1)

      stopDeliveryApiPolling()
      clock.tick(5000)
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('circuit breaker', () => {
    const FIVE_MINUTES_MS = 5 * 60 * 1000
    const POLL_INTERVAL_MS = 5000

    function respondWithNetworkError() {
      fetchSpy.mockReturnValue(Promise.reject(new Error('network error')))
    }

    async function tickAndFlush(ms: number) {
      clock.tick(ms)
      await flushPromises()
    }

    it('should keep polling while failures last less than five minutes', async () => {
      respondWithNetworkError()
      startDeliveryApiPolling(makeConfig({ pollInterval: POLL_INTERVAL_MS }))
      await flushPromises()

      // Just shy of five minutes of continuous failures.
      const ticks = Math.floor((FIVE_MINUTES_MS - POLL_INTERVAL_MS) / POLL_INTERVAL_MS)
      for (let i = 0; i < ticks; i++) {
        await tickAndFlush(POLL_INTERVAL_MS)
      }

      const callsBefore = fetchSpy.mock.calls.length
      await tickAndFlush(POLL_INTERVAL_MS)
      expect(fetchSpy.mock.calls.length).toBe(callsBefore + 1)
    })

    it('should stop polling after five minutes of continuous network failures', async () => {
      respondWithNetworkError()
      startDeliveryApiPolling(makeConfig({ pollInterval: POLL_INTERVAL_MS }))
      await flushPromises()

      // Run for slightly over five minutes of continuous failures.
      const ticks = Math.ceil(FIVE_MINUTES_MS / POLL_INTERVAL_MS) + 1
      for (let i = 0; i < ticks; i++) {
        await tickAndFlush(POLL_INTERVAL_MS)
      }

      const callsAtTrip = fetchSpy.mock.calls.length
      await tickAndFlush(POLL_INTERVAL_MS * 10)
      expect(fetchSpy.mock.calls.length).toBe(callsAtTrip)
    })

    it('should stop polling after five minutes of continuous 5xx responses', async () => {
      respondWith({}, 500)
      startDeliveryApiPolling(makeConfig({ pollInterval: POLL_INTERVAL_MS }))
      await flushPromises()

      const ticks = Math.ceil(FIVE_MINUTES_MS / POLL_INTERVAL_MS) + 1
      for (let i = 0; i < ticks; i++) {
        await tickAndFlush(POLL_INTERVAL_MS)
      }

      const callsAtTrip = fetchSpy.mock.calls.length
      await tickAndFlush(POLL_INTERVAL_MS * 10)
      expect(fetchSpy.mock.calls.length).toBe(callsAtTrip)
    })

    it('should treat 4xx responses as a config issue and trip immediately', async () => {
      respondWith({}, 403)
      startDeliveryApiPolling(makeConfig({ pollInterval: POLL_INTERVAL_MS }))
      await flushPromises()

      // No grace period for 4xx - the next tick should not poll.
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      await tickAndFlush(POLL_INTERVAL_MS * 10)
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    // 408 (Request Timeout) and 429 (Too Many Requests) are 4xx statuses that
    // are nevertheless expected to recover on their own - the request just took
    // too long, or the client/proxy is temporarily rate-limited. They should
    // follow the same transient-failure path as 5xx rather than trip the breaker
    // on a single response. This matches core's transport retry predicate
    // (`shouldRetryRequest` in `sendWithRetryStrategy.ts`).
    for (const status of [408, 429]) {
      it(`should treat ${status} as a transient failure rather than tripping immediately`, async () => {
        respondWith({}, status)
        startDeliveryApiPolling(makeConfig({ pollInterval: POLL_INTERVAL_MS }))
        await flushPromises()

        // Just shy of five minutes of continuous failures - should still be polling.
        const ticks = Math.floor((FIVE_MINUTES_MS - POLL_INTERVAL_MS) / POLL_INTERVAL_MS)
        for (let i = 0; i < ticks; i++) {
          await tickAndFlush(POLL_INTERVAL_MS)
        }
        const callsBefore = fetchSpy.mock.calls.length
        await tickAndFlush(POLL_INTERVAL_MS)
        expect(fetchSpy.mock.calls.length).toBe(callsBefore + 1)
      })

      it(`should eventually trip on continuous ${status} responses past the window`, async () => {
        respondWith({}, status)
        startDeliveryApiPolling(makeConfig({ pollInterval: POLL_INTERVAL_MS }))
        await flushPromises()

        const ticks = Math.ceil(FIVE_MINUTES_MS / POLL_INTERVAL_MS) + 1
        for (let i = 0; i < ticks; i++) {
          await tickAndFlush(POLL_INTERVAL_MS)
        }

        const callsAtTrip = fetchSpy.mock.calls.length
        await tickAndFlush(POLL_INTERVAL_MS * 10)
        expect(fetchSpy.mock.calls.length).toBe(callsAtTrip)
      })
    }

    it('should reset the failure window after a successful response', async () => {
      respondWithNetworkError()
      startDeliveryApiPolling(makeConfig({ pollInterval: POLL_INTERVAL_MS }))
      await flushPromises()

      // Almost five minutes of failures.
      await tickAndFlush(FIVE_MINUTES_MS - POLL_INTERVAL_MS)

      // One success resets the window.
      respondWith({ nextCursor: '', updates: [], deletions: [] })
      await tickAndFlush(POLL_INTERVAL_MS)

      // Back to failing - should get a fresh 5-minute window.
      respondWithNetworkError()
      await tickAndFlush(FIVE_MINUTES_MS - POLL_INTERVAL_MS)

      const callsBefore = fetchSpy.mock.calls.length
      await tickAndFlush(POLL_INTERVAL_MS)
      expect(fetchSpy.mock.calls.length).toBe(callsBefore + 1)
    })

    it('should clear active probes when tripping', async () => {
      respondWith({
        nextCursor: 'cursor-1',
        updates: [createProbe()],
        deletions: [],
      })
      startDeliveryApiPolling(makeConfig({ pollInterval: POLL_INTERVAL_MS }))
      await flushPromises()
      expect(getProbes(DEFAULT_PROBE_FUNCTION_ID)).toBeDefined()

      respondWithNetworkError()
      const ticks = Math.ceil(FIVE_MINUTES_MS / POLL_INTERVAL_MS) + 1
      for (let i = 0; i < ticks; i++) {
        await tickAndFlush(POLL_INTERVAL_MS)
      }

      expect(getProbes(DEFAULT_PROBE_FUNCTION_ID)).toBeUndefined()
    })

    it('should honor a configured maxUnreachableDuration', async () => {
      const customWindow = 30_000
      respondWithNetworkError()
      startDeliveryApiPolling(makeConfig({ pollInterval: POLL_INTERVAL_MS, maxUnreachableDuration: customWindow }))
      await flushPromises()

      // Just shy of the custom window - should still be polling.
      const ticks = Math.floor((customWindow - POLL_INTERVAL_MS) / POLL_INTERVAL_MS)
      for (let i = 0; i < ticks; i++) {
        await tickAndFlush(POLL_INTERVAL_MS)
      }
      const callsBeforeTrip = fetchSpy.mock.calls.length
      await tickAndFlush(POLL_INTERVAL_MS)
      expect(fetchSpy.mock.calls.length).toBe(callsBeforeTrip + 1)

      // One more tick past the custom window should trip and stop polling.
      await tickAndFlush(POLL_INTERVAL_MS)
      const callsAtTrip = fetchSpy.mock.calls.length
      await tickAndFlush(POLL_INTERVAL_MS * 10)
      expect(fetchSpy.mock.calls.length).toBe(callsAtTrip)
    })

    it('should fall back to the default maxUnreachableDuration when option is invalid', async () => {
      respondWithNetworkError()
      startDeliveryApiPolling(
        // -1 is invalid; should be ignored and the 5-minute default used.
        makeConfig({ pollInterval: POLL_INTERVAL_MS, maxUnreachableDuration: -1 })
      )
      await flushPromises()

      // Way past any "reasonable" misinterpretation - if -1 were honored,
      // polling would have already stopped. Confirm we're still polling at 30s.
      await tickAndFlush(30_000)
      const callsBefore = fetchSpy.mock.calls.length
      await tickAndFlush(POLL_INTERVAL_MS)
      expect(fetchSpy.mock.calls.length).toBe(callsBefore + 1)
    })

    it('should not re-install probes from an in-flight poll that is aborted by tripping', async () => {
      // First poll: hangs indefinitely so it's still in-flight when the breaker
      // trips. The fixture honors the AbortSignal exactly like a real fetch
      // would: rejecting with AbortError when the controller calls abort().
      let resolveFirstPoll!: (response: unknown) => void
      const firstPollFetchOptions: { signal?: AbortSignal } = {}
      fetchSpy.mockImplementation((_url: string, options: { signal?: AbortSignal }) => {
        firstPollFetchOptions.signal = options.signal
        return new Promise((resolve, reject) => {
          resolveFirstPoll = resolve
          options.signal?.addEventListener('abort', () => {
            reject(new DOMException('The user aborted a request', 'AbortError'))
          })
        })
      })

      startDeliveryApiPolling(makeConfig({ pollInterval: POLL_INTERVAL_MS }))
      await flushPromises()
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      // Quick check that the source passes an AbortSignal at all.
      expect(firstPollFetchOptions.signal).toBeTruthy()

      // Subsequent polls fail and trip the breaker.
      respondWithNetworkError()
      const ticks = Math.ceil(FIVE_MINUTES_MS / POLL_INTERVAL_MS) + 1
      for (let i = 0; i < ticks; i++) {
        await tickAndFlush(POLL_INTERVAL_MS)
      }

      // Breaker has tripped: polling stopped, probes cleared, and the in-flight
      // poll's signal must have been aborted.
      expect(getProbes(DEFAULT_PROBE_FUNCTION_ID)).toBeUndefined()
      expect(firstPollFetchOptions.signal!.aborted).toBe(true)
      const callsAtTrip = fetchSpy.mock.calls.length

      // Even if the hung response somehow still resolves with probe updates
      // after the abort, the poll has already rejected with AbortError and
      // returned - the success path can never run.
      resolveFirstPoll({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ nextCursor: 'late', updates: [createProbe()], deletions: [] }),
        text: () => Promise.resolve(''),
      })
      await flushPromises()

      expect(getProbes(DEFAULT_PROBE_FUNCTION_ID)).toBeUndefined()
      // No new fetches should have been issued either.
      await tickAndFlush(POLL_INTERVAL_MS * 5)
      expect(fetchSpy.mock.calls.length).toBe(callsAtTrip)
    })

    it('should warn when tripping', async () => {
      respondWithNetworkError()
      startDeliveryApiPolling(makeConfig({ pollInterval: POLL_INTERVAL_MS }))
      await flushPromises()

      const ticks = Math.ceil(FIVE_MINUTES_MS / POLL_INTERVAL_MS) + 1
      for (let i = 0; i < ticks; i++) {
        await tickAndFlush(POLL_INTERVAL_MS)
      }

      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/circuit breaker/i))
    })
  })
})

async function flushPromises() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
  }
}
