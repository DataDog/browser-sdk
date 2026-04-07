import { display } from '@datadog/browser-core'
import { registerCleanupTask, mockClock } from '@datadog/browser-core/test'
import type { Clock } from '@datadog/browser-core/test'
import { getProbes, clearProbes } from './probes'
import type { Probe } from './probes'
import { startDeliveryApiPolling, stopDeliveryApiPolling, clearDeliveryApiState } from './deliveryApi'
import type { DeliveryApiConfiguration } from './deliveryApi'

describe('deliveryApi', () => {
  let fetchSpy: jasmine.Spy
  let clock: Clock

  function makeConfig(overrides: Partial<DeliveryApiConfiguration> = {}): DeliveryApiConfiguration {
    return {
      applicationId: 'test-app-id',
      env: 'staging',
      version: '1.0.0',
      pollInterval: 5000,
      ...overrides,
    }
  }

  function respondWith(data: object, status = 200) {
    fetchSpy.and.returnValue(
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
    fetchSpy = spyOn(window, 'fetch')
    respondWith({ nextCursor: '', updates: [], deletions: [] })

    registerCleanupTask(() => {
      stopDeliveryApiPolling()
      clearDeliveryApiState()
      clearProbes()
    })
  })

  describe('startDeliveryApiPolling', () => {
    it('should make an initial POST request to the delivery API', () => {
      startDeliveryApiPolling(makeConfig())

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [url, options] = fetchSpy.calls.mostRecent().args
      expect(url).toBe('/api/ui/debugger/probe-delivery')
      expect(options.method).toBe('POST')
      expect(options.credentials).toBe('same-origin')
      expect(options.headers['Content-Type']).toBe('application/json; charset=utf-8')
      expect(options.headers['Accept']).toBe('application/vnd.datadog.debugger-probes+json; version=1')
    })

    it('should send the correct request body', () => {
      startDeliveryApiPolling(makeConfig())

      const [, options] = fetchSpy.calls.mostRecent().args
      const body = JSON.parse(options.body)
      expect(body).toEqual({
        applicationId: 'test-app-id',
        clientName: 'browser',
        clientVersion: jasmine.stringMatching(/.+/),
        env: 'staging',
        serviceVersion: '1.0.0',
      })
    })

    it('should not include nextCursor in the first request', () => {
      startDeliveryApiPolling(makeConfig())

      const [, options] = fetchSpy.calls.mostRecent().args
      const body = JSON.parse(options.body)
      expect(body.nextCursor).toBeUndefined()
    })

    it('should warn if polling is already started', () => {
      const warnSpy = spyOn(display, 'warn')
      startDeliveryApiPolling(makeConfig())
      startDeliveryApiPolling(makeConfig())

      expect(warnSpy).toHaveBeenCalledWith(jasmine.stringMatching(/already started/))
    })

    it('should add probes from the updates array', async () => {
      respondWith({
        nextCursor: 'cursor-1',
        updates: [makeProbe({ id: 'probe-1', version: 1 })],
        deletions: [],
      })

      startDeliveryApiPolling(makeConfig())
      await flushPromises()

      const probes = getProbes('test.js;testMethod')
      expect(probes).toBeDefined()
      expect(probes!.length).toBe(1)
      expect(probes![0].id).toBe('probe-1')
    })

    it('should remove probes listed in deletions', async () => {
      // First poll: add the probe via the delivery API
      respondWith({
        nextCursor: 'cursor-1',
        updates: [makeProbe({ id: 'probe-to-delete', version: 1 })],
        deletions: [],
      })

      startDeliveryApiPolling(makeConfig())
      await flushPromises()
      expect(getProbes('test.js;testMethod')).toBeDefined()

      // Second poll: delete it
      respondWith({
        nextCursor: 'cursor-2',
        updates: [],
        deletions: ['probe-to-delete'],
      })

      clock.tick(5000)
      await flushPromises()

      expect(getProbes('test.js;testMethod')).toBeUndefined()
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
      const [, options] = fetchSpy.calls.mostRecent().args
      const body = JSON.parse(options.body)
      expect(body.nextCursor).toBe('cursor-abc')
    })

    it('should update existing probes when they appear in updates again', async () => {
      respondWith({
        nextCursor: 'cursor-1',
        updates: [makeProbe({ id: 'probe-1', version: 1 })],
        deletions: [],
      })

      startDeliveryApiPolling(makeConfig())
      await flushPromises()

      respondWith({
        nextCursor: 'cursor-2',
        updates: [makeProbe({ id: 'probe-1', version: 2 })],
        deletions: [],
      })

      clock.tick(5000)
      await flushPromises()

      const probes = getProbes('test.js;testMethod')
      expect(probes).toBeDefined()
      expect(probes!.length).toBe(1)
      expect(probes![0].version).toBe(2)
    })

    it('should log an error when the response is not ok', async () => {
      const errorSpy = spyOn(display, 'error')
      respondWith({}, 500)

      startDeliveryApiPolling(makeConfig())
      await flushPromises()

      expect(errorSpy).toHaveBeenCalledWith(jasmine.stringMatching(/failed with status 500/), jasmine.any(String))
    })

    it('should log an error when fetch throws', async () => {
      const errorSpy = spyOn(display, 'error')
      fetchSpy.and.returnValue(Promise.reject(new Error('network error')))

      startDeliveryApiPolling(makeConfig())
      await flushPromises()

      expect(errorSpy).toHaveBeenCalledWith(jasmine.stringMatching(/poll error/), jasmine.any(Error))
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
})

async function flushPromises() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
  }
}

function makeProbe(overrides: Partial<Probe> = {}): Probe {
  return {
    id: 'probe-1',
    version: 1,
    type: 'LOG_PROBE',
    where: { typeName: 'test.js', methodName: 'testMethod' },
    template: 'Test message',
    captureSnapshot: false,
    capture: {},
    sampling: {},
    evaluateAt: 'ENTRY',
    ...overrides,
  }
}
