import { Observable } from '../src/observable'
import {
  isRejected,
  isServerError,
  RequestCompleteEvent,
  RequestObservables,
  RequestStartEvent,
  RequestType,
  trackFetch,
  trackXhr,
} from '../src/requestCollection'
import { FetchStub, FetchStubBuilder, FetchStubPromise, isFirefox, isIE } from '../src/specHelper'
import { includes } from '../src/utils'

describe('fetch tracker', () => {
  const FAKE_URL = 'http://fake-url/'
  let originalFetch: any
  let fetchStubBuilder: FetchStubBuilder
  let fetchStub: (input: RequestInfo, init?: RequestInit) => FetchStubPromise

  beforeEach(() => {
    if (isIE()) {
      pending('no fetch support')
    }
    originalFetch = window.fetch
    const requestObservables: RequestObservables = [new Observable(), new Observable()]
    fetchStubBuilder = new FetchStubBuilder(requestObservables)
    window.fetch = fetchStubBuilder.getStub()
    trackFetch(requestObservables)
    fetchStub = window.fetch as FetchStub
    window.onunhandledrejection = (ev: PromiseRejectionEvent) => {
      throw new Error(`unhandled rejected promise \n    ${ev.reason}`)
    }
  })

  afterEach(() => {
    window.fetch = originalFetch as any
    // tslint:disable-next-line:no-null-keyword
    window.onunhandledrejection = null
  })

  it('should track server error', (done) => {
    fetchStub(FAKE_URL).resolveWith({ status: 500, responseText: 'fetch error' })

    fetchStubBuilder.whenAllComplete((completeEvents: RequestCompleteEvent[]) => {
      const completeEvent = completeEvents[0]
      expect(completeEvent.type).toEqual(RequestType.FETCH)
      expect(completeEvent.method).toEqual('GET')
      expect(completeEvent.url).toEqual(FAKE_URL)
      expect(completeEvent.status).toEqual(500)
      expect(completeEvent.response).toEqual('fetch error')
      expect(isRejected(completeEvent)).toBe(false)
      expect(isServerError(completeEvent)).toBe(true)
      done()
    })
  })

  it('should track refused fetch', (done) => {
    fetchStub(FAKE_URL).rejectWith(new Error('fetch error'))

    fetchStubBuilder.whenAllComplete((completeEvents: RequestCompleteEvent[]) => {
      const completeEvent = completeEvents[0]
      expect(completeEvent.type).toEqual(RequestType.FETCH)
      expect(completeEvent.method).toEqual('GET')
      expect(completeEvent.url).toEqual(FAKE_URL)
      expect(completeEvent.status).toEqual(0)
      expect(completeEvent.response).toMatch(/Error: fetch error/)
      expect(isRejected(completeEvent)).toBe(true)
      expect(isServerError(completeEvent)).toBe(false)
      done()
    })
  })

  // https://fetch.spec.whatwg.org/#concept-body-consume-body
  it('should track fetch with response text error', (done) => {
    fetchStub(FAKE_URL).resolveWith({ status: 200, responseTextError: new Error('locked') })

    fetchStubBuilder.whenAllComplete((completeEvents: RequestCompleteEvent[]) => {
      const completeEvent = completeEvents[0]
      expect(completeEvent.type).toEqual(RequestType.FETCH)
      expect(completeEvent.method).toEqual('GET')
      expect(completeEvent.url).toEqual(FAKE_URL)
      expect(completeEvent.status).toEqual(200)
      expect(completeEvent.response).toMatch(/Error: locked/)
      expect(isRejected(completeEvent)).toBe(false)
      expect(isServerError(completeEvent)).toBe(false)
      done()
    })
  })

  it('should track opaque fetch', (done) => {
    // https://fetch.spec.whatwg.org/#concept-filtered-response-opaque
    fetchStub(FAKE_URL).resolveWith({ status: 0, type: 'opaque' })

    fetchStubBuilder.whenAllComplete((completeEvents: RequestCompleteEvent[]) => {
      const completeEvent = completeEvents[0]
      expect(completeEvent.type).toEqual(RequestType.FETCH)
      expect(completeEvent.method).toEqual('GET')
      expect(completeEvent.url).toEqual(FAKE_URL)
      expect(completeEvent.status).toEqual(0)
      expect(isRejected(completeEvent)).toBe(false)
      expect(isServerError(completeEvent)).toBe(false)
      done()
    })
  })

  it('should track client error', (done) => {
    fetchStub(FAKE_URL).resolveWith({ status: 400, responseText: 'Not found' })

    fetchStubBuilder.whenAllComplete((completeEvents: RequestCompleteEvent[]) => {
      const completeEvent = completeEvents[0]
      expect(completeEvent.type).toEqual(RequestType.FETCH)
      expect(completeEvent.method).toEqual('GET')
      expect(completeEvent.url).toEqual(FAKE_URL)
      expect(completeEvent.status).toEqual(400)
      expect(completeEvent.response).toEqual('Not found')
      expect(isRejected(completeEvent)).toBe(false)
      expect(isServerError(completeEvent)).toBe(false)
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

    fetchStubBuilder.whenAllComplete((completeEvents: RequestCompleteEvent[]) => {
      expect(completeEvents[0].method).toEqual('GET')
      expect(completeEvents[1].method).toEqual('GET')
      expect(completeEvents[2].method).toEqual('PUT')
      expect(completeEvents[3].method).toEqual('POST')
      expect(completeEvents[4].method).toEqual('POST')
      expect(completeEvents[5].method).toEqual('POST')
      done()
    })
  })

  it('should get url from input', (done) => {
    fetchStub(FAKE_URL).rejectWith(new Error('fetch error'))
    fetchStub(new Request(FAKE_URL)).rejectWith(new Error('fetch error'))
    fetchStubBuilder.whenAllComplete((completeEvents: RequestCompleteEvent[]) => {
      expect(completeEvents[0].url).toEqual(FAKE_URL)
      expect(completeEvents[1].url).toEqual(FAKE_URL)
      done()
    })
  })

  it('should keep promise resolved behavior', (done) => {
    const fetchStubPromise = fetchStub(FAKE_URL)
    const spy = jasmine.createSpy()
    fetchStubPromise.then(spy)
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
})

describe('xhr tracker', () => {
  let originalOpen: typeof XMLHttpRequest.prototype.open
  let originalSend: typeof XMLHttpRequest.prototype.send
  let requestStartObservable: Observable<RequestStartEvent>
  let requestCompleteObservable: Observable<RequestCompleteEvent>
  let startSpy: jasmine.Spy
  let completeSpy: jasmine.Spy

  beforeEach(() => {
    originalOpen = XMLHttpRequest.prototype.open
    originalSend = XMLHttpRequest.prototype.send
    requestStartObservable = new Observable()
    requestCompleteObservable = new Observable()
    startSpy = spyOn(requestStartObservable, 'notify').and.callThrough()
    completeSpy = spyOn(requestCompleteObservable, 'notify').and.callThrough()
    trackXhr([requestStartObservable, requestCompleteObservable])
  })

  afterEach(() => {
    XMLHttpRequest.prototype.open = originalOpen
    XMLHttpRequest.prototype.send = originalSend
  })

  function xhrSpec({
    done,
    setup,
    expectedMethod,
    expectedResponse,
    expectedStatus,
    expectedURL,
    expectXHR,
  }: {
    done: DoneFn
    setup: (xhr: XMLHttpRequest) => void
    expectedMethod: string | jasmine.Any
    expectedStatus: number | jasmine.Any
    expectedURL: string
    expectedResponse?: string | jasmine.Any
    expectXHR?: (xhr: XMLHttpRequest) => void
  }) {
    const xhr = new XMLHttpRequest()
    xhr.addEventListener('loadend', () => {
      setTimeout(() => {
        const completeEvent = (completeSpy.calls.allArgs() as RequestCompleteEvent[][])
          .map((args) => args[0])
          // IE10/11 doesn't have .find()
          .filter((d) => includes(d.url, expectedURL))[0]

        expect(completeEvent).toEqual({
          duration: (jasmine.any(Number) as unknown) as number,
          method: expectedMethod as string,
          requestId: (jasmine.any(Number) as unknown) as number,
          response: expectedResponse as string,
          startTime: (jasmine.any(Number) as unknown) as number,
          status: expectedStatus as number,
          traceId: undefined,
          type: RequestType.XHR,
          url: (jasmine.stringMatching(expectedURL) as unknown) as string,
        })
        expect(startSpy).toHaveBeenCalledWith({ requestId: completeEvent.requestId })

        if (expectXHR) {
          expectXHR(xhr)
        }

        done()
      })
    })
    setup(xhr)
  }

  it('should track successful request', (done) => {
    xhrSpec({
      done,
      setup(xhr) {
        xhr.open('GET', '/ok')
        xhr.send()
      },
      expectedMethod: 'GET',
      expectedResponse: 'ok',
      expectedStatus: 200,
      expectedURL: '/ok',
    })
  })

  it('should track client error', (done) => {
    xhrSpec({
      done,
      setup(xhr) {
        xhr.open('GET', '/expected-404')
        xhr.send()
      },
      expectedMethod: 'GET',
      expectedResponse: 'NOT FOUND',
      expectedStatus: 404,
      expectedURL: '/expected-404',
    })
  })

  it('should track server error', (done) => {
    xhrSpec({
      done,
      setup(xhr) {
        xhr.open('GET', '/throw')
        xhr.send()
      },
      expectedMethod: 'GET',
      expectedResponse: jasmine.stringMatching('expected server error'),
      expectedStatus: 500,
      expectedURL: '/throw',
    })
  })

  it('should track network error', (done) => {
    xhrSpec({
      done,
      setup(xhr) {
        xhr.open('GET', 'http://foo.bar/qux')
        xhr.send()
      },
      expectedMethod: 'GET',
      expectedResponse: '',
      expectedStatus: 0,
      expectedURL: 'http://foo.bar/qux',
    })
  })

  it('should track successful request aborted', (done) => {
    const onReadyStateChange = jasmine.createSpy()
    xhrSpec({
      done,
      setup(xhr) {
        xhr.onreadystatechange = onReadyStateChange
        xhr.addEventListener('load', () => xhr.abort())
        xhr.open('GET', '/ok')
        xhr.send()
      },
      expectedMethod: 'GET',
      expectedResponse: 'ok',
      expectedStatus: 200,
      expectedURL: '/ok',
      expectXHR(xhr) {
        expect(xhr.status).toBe(0)
        expect(onReadyStateChange).toHaveBeenCalled()
      },
    })
  })

  it('should track successful sync request', (done) => {
    xhrSpec({
      done,
      expectedMethod: 'GET',
      expectedResponse: 'ok',
      expectedStatus: 200,
      expectedURL: '/ok',
      setup(xhr) {
        xhr.open('GET', '/ok', false)
        xhr.send()
      },
    })
  })

  it('should track request with onreadystatechange overridden', (done) => {
    xhrSpec({
      done,
      expectedMethod: 'GET',
      expectedResponse: 'ok',
      expectedStatus: 200,
      expectedURL: '/ok',
      setup(xhr) {
        xhr.open('GET', '/ok')
        xhr.send()
        xhr.onreadystatechange = () => undefined
      },
    })
  })
})
