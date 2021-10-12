import { FetchStub, FetchStubManager, FetchStubPromise, stubFetch } from '../../test/specHelper'
import { isIE } from '../tools/browserDetection'
import { Subscription } from '../tools/observable'
import { FetchCompleteContext, FetchContext, initFetchObservable } from './fetchObservable'

describe('fetch proxy', () => {
  const FAKE_URL = 'http://fake-url/'
  let fetchStub: (input: RequestInfo, init?: RequestInit) => FetchStubPromise
  let fetchStubManager: FetchStubManager
  let requestsTrackingSubscription: Subscription
  let contextEditionSubscription: Subscription | undefined
  let requests: FetchCompleteContext[]
  let originalFetchStub: typeof fetch

  beforeEach(() => {
    if (isIE()) {
      pending('no fetch support')
    }
    fetchStubManager = stubFetch()
    originalFetchStub = window.fetch

    requests = []
    requestsTrackingSubscription = initFetchObservable().subscribe((context) => {
      if (context.state === 'complete') {
        requests.push(context)
      }
    })
    fetchStub = window.fetch as FetchStub
  })

  afterEach(() => {
    requestsTrackingSubscription.unsubscribe()
    contextEditionSubscription?.unsubscribe()
    fetchStubManager.reset()
  })

  it('should track server error', (done) => {
    fetchStub(FAKE_URL).resolveWith({ status: 500, responseText: 'fetch error' })

    fetchStubManager.whenAllComplete(() => {
      const request = requests[0]
      expect(request.method).toEqual('GET')
      expect(request.url).toEqual(FAKE_URL)
      expect(request.status).toEqual(500)
      expect(request.responseText).toEqual('fetch error')
      expect(request.isAborted).toBe(false)
      done()
    })
  })

  it('should track refused fetch', (done) => {
    fetchStub(FAKE_URL).rejectWith(new Error('fetch error'))

    fetchStubManager.whenAllComplete(() => {
      const request = requests[0]
      expect(request.method).toEqual('GET')
      expect(request.url).toEqual(FAKE_URL)
      expect(request.status).toEqual(0)
      expect(request.responseText).toMatch(/Error: fetch error/)
      expect(request.isAborted).toBe(false)
      expect(request.error).toEqual(new Error('fetch error'))
      done()
    })
  })

  it('should track aborted fetch', (done) => {
    fetchStub(FAKE_URL).abort()

    fetchStubManager.whenAllComplete(() => {
      const request = requests[0]
      expect(request.method).toEqual('GET')
      expect(request.url).toEqual(FAKE_URL)
      expect(request.status).toEqual(0)
      expect(request.responseText).toContain('AbortError: The user aborted a request')
      expect(request.isAborted).toBe(true)
      expect(request.error).toEqual(new DOMException('The user aborted a request', 'AbortError'))
      done()
    })
  })

  // https://fetch.spec.whatwg.org/#concept-body-consume-body
  it('should track fetch with response text error', (done) => {
    fetchStub(FAKE_URL).resolveWith({ status: 200, responseTextError: new Error('locked') })

    fetchStubManager.whenAllComplete(() => {
      const request = requests[0]
      expect(request.method).toEqual('GET')
      expect(request.url).toEqual(FAKE_URL)
      expect(request.status).toEqual(200)
      expect(request.responseText).toMatch(/Error: locked/)
      expect(request.isAborted).toBe(false)
      expect(request.error).toBeUndefined()
      done()
    })
  })

  it('should track opaque fetch', (done) => {
    // https://fetch.spec.whatwg.org/#concept-filtered-response-opaque
    fetchStub(FAKE_URL).resolveWith({ status: 0, type: 'opaque' })

    fetchStubManager.whenAllComplete(() => {
      const request = requests[0]
      expect(request.method).toEqual('GET')
      expect(request.url).toEqual(FAKE_URL)
      expect(request.status).toEqual(0)
      expect(request.isAborted).toBe(false)
      done()
    })
  })

  it('should track client error', (done) => {
    fetchStub(FAKE_URL).resolveWith({ status: 400, responseText: 'Not found' })

    fetchStubManager.whenAllComplete(() => {
      const request = requests[0]
      expect(request.method).toEqual('GET')
      expect(request.url).toEqual(FAKE_URL)
      expect(request.status).toEqual(400)
      expect(request.responseText).toEqual('Not found')
      expect(request.isAborted).toBe(false)
      done()
    })
  })

  it('should get method from input', (done) => {
    fetchStub(FAKE_URL).resolveWith({ status: 500 })
    fetchStub(new Request(FAKE_URL)).resolveWith({ status: 500 })
    fetchStub(new Request(FAKE_URL, { method: 'PUT' })).resolveWith({ status: 500 })
    fetchStub(new Request(FAKE_URL, { method: 'PUT' }), { method: 'POST' }).resolveWith({ status: 500 })
    fetchStub(new Request(FAKE_URL), { method: 'POST' }).resolveWith({ status: 500 })
    fetchStub(FAKE_URL, { method: 'POST' }).resolveWith({ status: 500 })

    fetchStubManager.whenAllComplete(() => {
      expect(requests[0].method).toEqual('GET')
      expect(requests[1].method).toEqual('GET')
      expect(requests[2].method).toEqual('PUT')
      expect(requests[3].method).toEqual('POST')
      expect(requests[4].method).toEqual('POST')
      expect(requests[5].method).toEqual('POST')
      done()
    })
  })

  it('should get url from input', (done) => {
    fetchStub(FAKE_URL).rejectWith(new Error('fetch error'))
    fetchStub(new Request(FAKE_URL)).rejectWith(new Error('fetch error'))

    fetchStubManager.whenAllComplete(() => {
      expect(requests[0].url).toEqual(FAKE_URL)
      expect(requests[1].url).toEqual(FAKE_URL)
      done()
    })
  })

  it('should keep promise resolved behavior', (done) => {
    const fetchStubPromise = fetchStub(FAKE_URL)
    const spy = jasmine.createSpy()
    fetchStubPromise.then(spy).catch(() => {
      fail('Should not have thrown an error!')
    })
    fetchStubPromise.resolveWith({ status: 500 })

    setTimeout(() => {
      expect(spy).toHaveBeenCalled()
      done()
    })
  })

  it('should keep promise rejected behavior', (done) => {
    const fetchStubPromise = fetchStub(FAKE_URL)
    const spy = jasmine.createSpy()
    fetchStubPromise.catch(spy)
    fetchStubPromise.rejectWith(new Error('fetch error'))

    setTimeout(() => {
      expect(spy).toHaveBeenCalled()
      done()
    })
  })

  it('should allow to enhance the context', (done) => {
    type CustomContext = FetchContext & { foo: string }
    contextEditionSubscription = initFetchObservable().subscribe((rawContext) => {
      const context = rawContext as CustomContext
      if (context.state === 'start') {
        context.foo = 'bar'
      }
    })
    fetchStub(FAKE_URL).resolveWith({ status: 500, responseText: 'fetch error' })

    fetchStubManager.whenAllComplete(() => {
      expect((requests[0] as CustomContext).foo).toBe('bar')
      done()
    })
  })

  describe('when unsubscribing', () => {
    it('should stop tracking requests', (done) => {
      requestsTrackingSubscription.unsubscribe()

      fetchStub(FAKE_URL).resolveWith({ status: 200, responseText: 'ok' })

      fetchStubManager.whenAllComplete(() => {
        expect(requests).toEqual([])
        done()
      })
    })

    it('should restore original window.fetch', () => {
      requestsTrackingSubscription.unsubscribe()

      expect(window.fetch).toBe(originalFetchStub)
    })
  })
})
