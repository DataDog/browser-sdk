import { vi } from 'vitest'
import type { MockFetch, MockFetchManager } from '../../test'
import { registerCleanupTask, mockFetch } from '../../test'
import type { Subscription } from '../tools/observable'
import type { FetchResolveContext, FetchContext } from './fetchObservable'
import { initFetchObservable, resetFetchObservable, ResponseBodyAction } from './fetchObservable'

describe('fetch proxy', () => {
  const FAKE_URL = 'http://fake-url/'
  const FAKE_RELATIVE_URL = '/fake-path'
  const NORMALIZED_FAKE_RELATIVE_URL = `${location.origin}/fake-path`
  let mockFetchManager: MockFetchManager
  let requestsTrackingSubscription: Subscription
  let contextEditionSubscription: Subscription | undefined
  let requests: FetchResolveContext[]
  let originalMockFetch: typeof window.fetch
  let fetch: MockFetch

  beforeEach(() => {
    mockFetchManager = mockFetch()
    originalMockFetch = window.fetch

    requests = []
    requestsTrackingSubscription = initFetchObservable().subscribe((context) => {
      if (context.state === 'resolve') {
        requests.push(context)
      }
    })
    fetch = window.fetch as MockFetch

    registerCleanupTask(() => {
      requestsTrackingSubscription.unsubscribe()
      contextEditionSubscription?.unsubscribe()
      resetFetchObservable()
    })
  })

  it('should track server error', () => new Promise<void>((resolve) => {
    fetch(FAKE_URL).resolveWith({ status: 500, responseText: 'fetch error' })

    mockFetchManager.whenAllComplete(() => {
      const request = requests[0]
      expect(request.method).toEqual('GET')
      expect(request.url).toEqual(FAKE_URL)
      expect(request.status).toEqual(500)
      expect(request.isAborted).toBe(false)
      expect(request.handlingStack).toBeDefined()
      resolve()
    })
  }))

  it('should track refused fetch', () => new Promise<void>((resolve) => {
    fetch(FAKE_URL).rejectWith(new Error('fetch error'))

    mockFetchManager.whenAllComplete(() => {
      const request = requests[0]
      expect(request.method).toEqual('GET')
      expect(request.url).toEqual(FAKE_URL)
      expect(request.status).toEqual(0)
      expect(request.isAborted).toBe(false)
      expect(request.error).toEqual(new Error('fetch error'))
      expect(request.handlingStack).toBeDefined()
      resolve()
    })
  }))

  it('should track aborted fetch', () => new Promise<void>((resolve) => {
    fetch(FAKE_URL).abort()

    mockFetchManager.whenAllComplete(() => {
      const request = requests[0]
      expect(request.method).toEqual('GET')
      expect(request.url).toEqual(FAKE_URL)
      expect(request.status).toEqual(0)
      expect(request.isAborted).toBe(true)
      expect(request.error).toEqual(new DOMException('The user aborted a request', 'AbortError'))
      expect(request.handlingStack).toBeDefined()
      resolve()
    })
  }))

  it('should track fetch aborted by AbortController', () => new Promise<void>((resolve) => {
    if (!window.AbortController) {
      return resolve() // skip: 'AbortController is not supported'
    }

    const controller = new AbortController()
    void fetch(FAKE_URL, { signal: controller.signal })
    controller.abort('AbortError')

    mockFetchManager.whenAllComplete(() => {
      const request = requests[0]
      expect(request.method).toEqual('GET')
      expect(request.url).toEqual(FAKE_URL)
      expect(request.status).toEqual(0)
      expect(request.isAborted).toBe(true)
      expect(request.error).toEqual(controller.signal.reason)
      expect(request.handlingStack).toBeDefined()
      resolve()
    })
  }))

  it('should track opaque fetch', () => new Promise<void>((resolve) => {
    // https://fetch.spec.whatwg.org/#concept-filtered-response-opaque
    fetch(FAKE_URL).resolveWith({ status: 0, type: 'opaque' })

    mockFetchManager.whenAllComplete(() => {
      const request = requests[0]
      expect(request.method).toEqual('GET')
      expect(request.url).toEqual(FAKE_URL)
      expect(request.status).toEqual(0)
      expect(request.isAborted).toBe(false)
      resolve()
    })
  }))

  it('should track client error', () => new Promise<void>((resolve) => {
    fetch(FAKE_URL).resolveWith({ status: 400, responseText: 'Not found' })

    mockFetchManager.whenAllComplete(() => {
      const request = requests[0]
      expect(request.method).toEqual('GET')
      expect(request.url).toEqual(FAKE_URL)
      expect(request.status).toEqual(400)
      expect(request.isAborted).toBe(false)
      resolve()
    })
  }))

  it('should get method from input', () => new Promise<void>((resolve) => {
    fetch(FAKE_URL).resolveWith({ status: 500 })
    fetch(new Request(FAKE_URL)).resolveWith({ status: 500 })
    fetch(new Request(FAKE_URL, { method: 'PUT' })).resolveWith({ status: 500 })
    fetch(new Request(FAKE_URL, { method: 'PUT' }), { method: 'POST' }).resolveWith({ status: 500 })
    fetch(new Request(FAKE_URL), { method: 'POST' }).resolveWith({ status: 500 })
    fetch(FAKE_URL, { method: 'POST' }).resolveWith({ status: 500 })
    fetch(FAKE_URL, { method: 'post' }).resolveWith({ status: 500 })
    fetch(null as any).resolveWith({ status: 500 })
    fetch({ method: 'POST' } as any).resolveWith({ status: 500 })
    fetch(FAKE_URL, { method: null as any }).resolveWith({ status: 500 })
    fetch(FAKE_URL, { method: undefined }).resolveWith({ status: 500 })

    mockFetchManager.whenAllComplete(() => {
      expect(requests[0].method).toEqual('GET')
      expect(requests[1].method).toEqual('GET')
      expect(requests[2].method).toEqual('PUT')
      expect(requests[3].method).toEqual('POST')
      expect(requests[4].method).toEqual('POST')
      expect(requests[5].method).toEqual('POST')
      expect(requests[6].method).toEqual('POST')
      expect(requests[7].method).toEqual('GET')
      expect(requests[8].method).toEqual('GET')
      expect(requests[9].method).toEqual('NULL')
      expect(requests[10].method).toEqual('GET')

      resolve()
    })
  }))

  it('should get the normalized url from input', () => new Promise<void>((resolve) => {
    fetch(FAKE_URL).rejectWith(new Error('fetch error'))
    fetch(new Request(FAKE_URL)).rejectWith(new Error('fetch error'))
    fetch(null as any).rejectWith(new Error('fetch error'))
    fetch({
      toString() {
        return FAKE_RELATIVE_URL
      },
    } as any).rejectWith(new Error('fetch error'))
    fetch(FAKE_RELATIVE_URL).rejectWith(new Error('fetch error'))
    fetch(new Request(FAKE_RELATIVE_URL)).rejectWith(new Error('fetch error'))

    mockFetchManager.whenAllComplete(() => {
      expect(requests[0].url).toEqual(FAKE_URL)
      expect(requests[1].url).toEqual(FAKE_URL)
      expect(requests[2].url).toMatch(/\/null$/)
      expect(requests[3].url).toEqual(NORMALIZED_FAKE_RELATIVE_URL)
      expect(requests[4].url).toEqual(NORMALIZED_FAKE_RELATIVE_URL)
      expect(requests[5].url).toEqual(NORMALIZED_FAKE_RELATIVE_URL)
      resolve()
    })
  }))

  it('should keep promise resolved behavior for Response', () => new Promise<void>((resolve) => {
    const mockFetchPromise = fetch(FAKE_URL)
    const spy = vi.fn()
    mockFetchPromise.then(spy).catch(() => {
      throw new Error('Should not have thrown an error!')
    })
    mockFetchPromise.resolveWith({ status: 500 })

    setTimeout(() => {
      expect(spy).toHaveBeenCalled()
      resolve()
    })
  }))

  it('should keep promise resolved behavior for any other type', () => new Promise<void>((resolve) => {
    const mockFetchPromise = fetch(FAKE_URL)
    const spy = vi.fn()
    mockFetchPromise.then(spy).catch(() => {
      throw new Error('Should not have thrown an error!')
    })
    mockFetchPromise.resolveWith('response' as any)

    setTimeout(() => {
      expect(spy).toHaveBeenCalled()
      resolve()
    })
  }))

  it('should keep promise rejected behavior for Error', () => new Promise<void>((resolve) => {
    const mockFetchPromise = fetch(FAKE_URL)
    const spy = vi.fn()
    mockFetchPromise.catch(spy)
    mockFetchPromise.rejectWith(new Error('fetch error'))

    setTimeout(() => {
      expect(spy).toHaveBeenCalled()
      resolve()
    })
  }))

  it('should keep promise rejected behavior for any other type', () => new Promise<void>((resolve) => {
    const mockFetchPromise = fetch(FAKE_URL)
    const spy = vi.fn()
    mockFetchPromise.catch(spy)
    mockFetchPromise.rejectWith('fetch error' as any)

    setTimeout(() => {
      expect(spy).toHaveBeenCalled()
      resolve()
    })
  }))

  it('should allow to enhance the context', () => new Promise<void>((resolve) => {
    type CustomContext = FetchContext & { foo: string }
    contextEditionSubscription = initFetchObservable().subscribe((rawContext) => {
      const context = rawContext as CustomContext
      if (context.state === 'start') {
        context.foo = 'bar'
      }
    })
    fetch(FAKE_URL).resolveWith({ status: 500, responseText: 'fetch error' })

    mockFetchManager.whenAllComplete(() => {
      expect((requests[0] as CustomContext).foo).toBe('bar')
      resolve()
    })
  }))

  describe('when unsubscribing', () => {
    it('should stop tracking requests', () => new Promise<void>((resolve) => {
      requestsTrackingSubscription.unsubscribe()

      fetch(FAKE_URL).resolveWith({ status: 200, responseText: 'ok' })

      mockFetchManager.whenAllComplete(() => {
        expect(requests).toEqual([])
        resolve()
      })
    }))

    it('should restore original window.fetch', () => {
      requestsTrackingSubscription.unsubscribe()

      expect(window.fetch).toBe(originalMockFetch)
    })
  })
})

describe('fetch proxy with ResponseBodyAction', () => {
  const FAKE_URL = 'http://fake-url/'
  let mockFetchManager: MockFetchManager
  let requestsTrackingSubscription: Subscription
  let requests: FetchResolveContext[]
  let fetch: MockFetch

  function setupFetchTracking(responseBodyAction: () => ResponseBodyAction) {
    mockFetchManager = mockFetch()
    requests = []
    requestsTrackingSubscription = initFetchObservable({ responseBodyAction }).subscribe((context) => {
      if (context.state === 'resolve') {
        requests.push(context)
      }
    })
    fetch = window.fetch as MockFetch
  }

  afterEach(() => {
    requestsTrackingSubscription?.unsubscribe()
    resetFetchObservable()
  })

  it('should collect response body with COLLECT action', () => new Promise<void>((resolve) => {
    setupFetchTracking(() => ResponseBodyAction.COLLECT)

    fetch(FAKE_URL).resolveWith({ status: 200, responseText: 'response body content' })

    mockFetchManager.whenAllComplete(() => {
      expect(requests[0].responseBody).toBe('response body content')
      resolve()
    })
  }))

  it('should not collect response body with WAIT or IGNORE action', () => new Promise<void>((resolve) => {
    setupFetchTracking(() => ResponseBodyAction.WAIT)

    fetch(FAKE_URL).resolveWith({ status: 200, responseText: 'response body content' })

    mockFetchManager.whenAllComplete(() => {
      expect(requests[0].responseBody).toBeUndefined()
      resolve()
    })
  }))

  it('should use the highest priority action when multiple getters are registered', () => new Promise<void>((resolve) => {
    setupFetchTracking(() => ResponseBodyAction.WAIT)

    initFetchObservable({
      responseBodyAction: () => ResponseBodyAction.COLLECT,
    })

    registerCleanupTask(() => {
      requestsTrackingSubscription.unsubscribe()
    })

    fetch = window.fetch as MockFetch
    fetch(FAKE_URL).resolveWith({ status: 200, responseText: 'response body content' })

    mockFetchManager.whenAllComplete(() => {
      expect(requests[0].responseBody).toBe('response body content')
      resolve()
    })
  }))
})
