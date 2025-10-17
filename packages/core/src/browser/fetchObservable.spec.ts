import { vi, expect } from 'vitest'
import type { MockFetch, MockFetchManager} from '../../test'
import { registerCleanupTask, mockFetch } from '../../test'
import type { Subscription } from '../tools/observable'
import type { FetchResolveContext, FetchContext } from './fetchObservable'
import { initFetchObservable } from './fetchObservable'

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
    })
  })

  it('should track server error', async () => {
    fetch(FAKE_URL).resolveWith({ status: 500, responseText: 'fetch error' })

    await mockFetchManager.whenAllCompleteAsync()
    const request = requests[0]
    expect(request.method).toEqual('GET')
    expect(request.url).toEqual(FAKE_URL)
    expect(request.status).toEqual(500)
    expect(request.isAborted).toBe(false)
    expect(request.handlingStack).toBeDefined()
  })

  it('should track refused fetch', async () => {
    fetch(FAKE_URL).rejectWith(new Error('fetch error'))

    await mockFetchManager.whenAllCompleteAsync()
    const request = requests[0]
    expect(request.method).toEqual('GET')
    expect(request.url).toEqual(FAKE_URL)
    expect(request.status).toEqual(0)
    expect(request.isAborted).toBe(false)
    expect(request.error).toEqual(new Error('fetch error'))
    expect(request.handlingStack).toBeDefined()
  })

  it('should track aborted fetch', async () => {
    fetch(FAKE_URL).abort()

    await mockFetchManager.whenAllCompleteAsync()
    const request = requests[0]
    expect(request.method).toEqual('GET')
    expect(request.url).toEqual(FAKE_URL)
    expect(request.status).toEqual(0)
    expect(request.isAborted).toBe(true)
    expect(request.error).toEqual(new DOMException('The user aborted a request', 'AbortError'))
    expect(request.handlingStack).toBeDefined()
  })

  it('should track fetch aborted by AbortController', async () => {
    if (!window.AbortController) {
      pending('AbortController is not supported')
    }

    const controller = new AbortController()
    void fetch(FAKE_URL, { signal: controller.signal })
    controller.abort('AbortError')

    await mockFetchManager.whenAllCompleteAsync()
    const request = requests[0]
    expect(request.method).toEqual('GET')
    expect(request.url).toEqual(FAKE_URL)
    expect(request.status).toEqual(0)
    expect(request.isAborted).toBe(true)
    expect(request.error).toEqual(controller.signal.reason)
    expect(request.handlingStack).toBeDefined()
  })

  it('should track opaque fetch', async () => {
    // https://fetch.spec.whatwg.org/#concept-filtered-response-opaque
    fetch(FAKE_URL).resolveWith({ status: 0, type: 'opaque' })

    await mockFetchManager.whenAllCompleteAsync()
    const request = requests[0]
    expect(request.method).toEqual('GET')
    expect(request.url).toEqual(FAKE_URL)
    expect(request.status).toEqual(0)
    expect(request.isAborted).toBe(false)
  })

  it('should track client error', async () => {
    fetch(FAKE_URL).resolveWith({ status: 400, responseText: 'Not found' })

    await mockFetchManager.whenAllCompleteAsync()
    const request = requests[0]
    expect(request.method).toEqual('GET')
    expect(request.url).toEqual(FAKE_URL)
    expect(request.status).toEqual(400)
    expect(request.isAborted).toBe(false)
  })

  it('should get method from input', async () => {
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

    await mockFetchManager.whenAllCompleteAsync()
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
  })

  it('should get the normalized url from input', async () => {
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

    await mockFetchManager.whenAllCompleteAsync()
    expect(requests[0].url).toEqual(FAKE_URL)
    expect(requests[1].url).toEqual(FAKE_URL)
    expect(requests[2].url).toMatch(/\/null$/)
    expect(requests[3].url).toEqual(NORMALIZED_FAKE_RELATIVE_URL)
    expect(requests[4].url).toEqual(NORMALIZED_FAKE_RELATIVE_URL)
    expect(requests[5].url).toEqual(NORMALIZED_FAKE_RELATIVE_URL)
  })

  it('should keep promise resolved behavior for Response', async () => {
    const mockFetchPromise = fetch(FAKE_URL)
    const spy = vi.fn()
    mockFetchPromise.then(spy).catch(() => {
      fail('Should not have thrown an error!')
    })
    mockFetchPromise.resolveWith({ status: 500 })

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(spy).toHaveBeenCalled()
  })

  it('should keep promise resolved behavior for any other type', async () => {
    const mockFetchPromise = fetch(FAKE_URL)
    const spy = vi.fn()
    mockFetchPromise.then(spy).catch(() => {
      fail('Should not have thrown an error!')
    })
    mockFetchPromise.resolveWith('response' as any)

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(spy).toHaveBeenCalled()
  })

  it('should keep promise rejected behavior for Error', async () => {
    const mockFetchPromise = fetch(FAKE_URL)
    const spy = vi.fn()
    mockFetchPromise.catch(spy)
    mockFetchPromise.rejectWith(new Error('fetch error'))

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(spy).toHaveBeenCalled()
  })

  it('should keep promise rejected behavior for any other type', async () => {
    const mockFetchPromise = fetch(FAKE_URL)
    const spy = vi.fn()
    mockFetchPromise.catch(spy)
    mockFetchPromise.rejectWith('fetch error' as any)

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(spy).toHaveBeenCalled()
  })

  it('should allow to enhance the context', async () => {
    type CustomContext = FetchContext & { foo: string }
    contextEditionSubscription = initFetchObservable().subscribe((rawContext) => {
      const context = rawContext as CustomContext
      if (context.state === 'start') {
        context.foo = 'bar'
      }
    })
    fetch(FAKE_URL).resolveWith({ status: 500, responseText: 'fetch error' })

    await mockFetchManager.whenAllCompleteAsync()
    expect((requests[0] as CustomContext).foo).toBe('bar')
  })

  describe('when unsubscribing', () => {
    it('should stop tracking requests', async () => {
      requestsTrackingSubscription.unsubscribe()

      fetch(FAKE_URL).resolveWith({ status: 200, responseText: 'ok' })

      await mockFetchManager.whenAllCompleteAsync()
      expect(requests).toEqual([])
    })

    it('should restore original window.fetch', () => {
      requestsTrackingSubscription.unsubscribe()

      expect(window.fetch).toBe(originalMockFetch)
    })
  })
})
