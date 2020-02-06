import { Observable } from '../src/observable'
import {
  isRejected,
  isServerError,
  normalizeUrl,
  RequestDetails,
  RequestType,
  trackFetch,
} from '../src/requestCollection'
import { FetchStub, FetchStubBuilder, FetchStubPromise, isFirefox, isIE } from '../src/specHelper'

describe('fetch tracker', () => {
  const FAKE_URL = 'http://fake-url/'
  let originalFetch: any
  let fetchStubBuilder: FetchStubBuilder
  let fetchStub: (input: RequestInfo, init?: RequestInit) => FetchStubPromise
  let notifySpy: jasmine.Spy

  beforeEach(() => {
    if (isIE()) {
      pending('no fetch support')
    }
    originalFetch = window.fetch
    const requestObservable = new Observable<RequestDetails>()
    notifySpy = spyOn(requestObservable, 'notify').and.callThrough()
    fetchStubBuilder = new FetchStubBuilder(requestObservable)
    window.fetch = fetchStubBuilder.getStub()
    trackFetch(requestObservable)
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

    fetchStubBuilder.whenAllComplete((requests: RequestDetails[]) => {
      const request = requests[0]
      expect(request.type).toEqual(RequestType.FETCH)
      expect(request.method).toEqual('GET')
      expect(request.url).toEqual(FAKE_URL)
      expect(request.status).toEqual(500)
      expect(request.response).toEqual('fetch error')
      expect(isRejected(request)).toBe(false)
      expect(isServerError(request)).toBe(true)
      done()
    })
  })

  it('should track refused fetch', (done) => {
    fetchStub(FAKE_URL).rejectWith(new Error('fetch error'))

    fetchStubBuilder.whenAllComplete((requests: RequestDetails[]) => {
      const request = requests[0]
      expect(request.type).toEqual(RequestType.FETCH)
      expect(request.method).toEqual('GET')
      expect(request.url).toEqual(FAKE_URL)
      expect(request.status).toEqual(0)
      expect(request.response).toMatch(/Error: fetch error/)
      expect(isRejected(request)).toBe(true)
      expect(isServerError(request)).toBe(false)
      done()
    })
  })

  // https://fetch.spec.whatwg.org/#concept-body-consume-body
  it('should track fetch with response text error', (done) => {
    fetchStub(FAKE_URL).resolveWith({ status: 200, responseTextError: new Error('locked') })

    fetchStubBuilder.whenAllComplete((requests: RequestDetails[]) => {
      const request = requests[0]
      expect(request.type).toEqual(RequestType.FETCH)
      expect(request.method).toEqual('GET')
      expect(request.url).toEqual(FAKE_URL)
      expect(request.status).toEqual(200)
      expect(request.response).toMatch(/Error: locked/)
      expect(isRejected(request)).toBe(false)
      expect(isServerError(request)).toBe(false)
      done()
    })
  })

  it('should track opaque fetch', (done) => {
    // https://fetch.spec.whatwg.org/#concept-filtered-response-opaque
    fetchStub(FAKE_URL).resolveWith({ status: 0, type: 'opaque' })

    fetchStubBuilder.whenAllComplete((requests: RequestDetails[]) => {
      const request = requests[0]
      expect(request.type).toEqual(RequestType.FETCH)
      expect(request.method).toEqual('GET')
      expect(request.url).toEqual(FAKE_URL)
      expect(request.status).toEqual(0)
      expect(isRejected(request)).toBe(false)
      expect(isServerError(request)).toBe(false)
      done()
    })
  })

  it('should track client error', (done) => {
    fetchStub(FAKE_URL).resolveWith({ status: 400, responseText: 'Not found' })

    fetchStubBuilder.whenAllComplete((requests: RequestDetails[]) => {
      const request = requests[0]
      expect(request.type).toEqual(RequestType.FETCH)
      expect(request.method).toEqual('GET')
      expect(request.url).toEqual(FAKE_URL)
      expect(request.status).toEqual(400)
      expect(request.response).toEqual('Not found')
      expect(isRejected(request)).toBe(false)
      expect(isServerError(request)).toBe(false)
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

    fetchStubBuilder.whenAllComplete((requests: RequestDetails[]) => {
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
    fetchStubBuilder.whenAllComplete((requests: RequestDetails[]) => {
      expect(requests[0].url).toEqual(FAKE_URL)
      expect(requests[1].url).toEqual(FAKE_URL)
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

describe('normalize url', () => {
  it('should add origin to relative path', () => {
    expect(normalizeUrl('/my/path')).toEqual(`${window.location.origin}/my/path`)
  })

  it('should add protocol to relative url', () => {
    expect(normalizeUrl('//foo.com:9876/my/path')).toEqual('http://foo.com:9876/my/path')
  })

  it('should keep full url unchanged', () => {
    expect(normalizeUrl('https://foo.com/my/path')).toEqual('https://foo.com/my/path')
  })

  it('should keep non http url unchanged', () => {
    if (isFirefox()) {
      pending('https://bugzilla.mozilla.org/show_bug.cgi?id=1578787')
    }
    expect(normalizeUrl('file://foo.com/my/path')).toEqual('file://foo.com/my/path')
  })
})
