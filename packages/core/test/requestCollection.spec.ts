import { Observable } from '../src/observable'
import { isRejected, isServerError, RequestDetails, RequestType, trackFetch, trackXhr } from '../src/requestCollection'
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

describe('xhr tracker', () => {
  let originalOpen: typeof XMLHttpRequest.prototype.open
  let originalSend: typeof XMLHttpRequest.prototype.send
  let requestObservable: Observable<RequestDetails>
  let notifySpy: jasmine.Spy

  beforeEach(() => {
    originalOpen = XMLHttpRequest.prototype.open
    originalSend = XMLHttpRequest.prototype.send
    requestObservable = new Observable<RequestDetails>()
    notifySpy = spyOn(requestObservable, 'notify').and.callThrough()
    trackXhr(requestObservable)
  })

  afterEach(() => {
    XMLHttpRequest.prototype.open = originalOpen
    XMLHttpRequest.prototype.send = originalSend
  })

  function xhrSpec(setup: (xhr: XMLHttpRequest) => void, expectations: (xhr: XMLHttpRequest) => void, done: DoneFn) {
    const xhr = new XMLHttpRequest()
    xhr.addEventListener('loadend', () => {
      setTimeout(() => {
        expect(notifySpy).toHaveBeenCalledWith(
          jasmine.objectContaining({
            duration: jasmine.any(Number),
            startTime: jasmine.any(Number),
            traceId: undefined,
            type: 'xhr',
          })
        )
        expectations(xhr)
        done()
      })
    })
    setup(xhr)
  }

  it('should track successful request', (done) => {
    xhrSpec(
      (xhr) => {
        xhr.open('GET', '/ok')
        xhr.send()
      },
      () => {
        expect(notifySpy).toHaveBeenCalledWith(
          jasmine.objectContaining({
            method: 'GET',
            response: 'ok',
            status: 200,
            url: jasmine.stringMatching('/ok'),
          })
        )
      },
      done
    )
  })

  it('should track client error', (done) => {
    xhrSpec(
      (xhr) => {
        xhr.open('GET', '/expected-404')
        xhr.send()
      },
      () => {
        expect(notifySpy).toHaveBeenCalledWith(
          jasmine.objectContaining({
            method: 'GET',
            response: 'NOT FOUND',
            status: 404,
            url: jasmine.stringMatching('/expected-404'),
          })
        )
      },
      done
    )
  })

  it('should track server error', (done) => {
    xhrSpec(
      (xhr) => {
        xhr.open('GET', '/throw')
        xhr.send()
      },
      () => {
        expect(notifySpy).toHaveBeenCalledWith(
          jasmine.objectContaining({
            method: 'GET',
            response: jasmine.stringMatching('expected server error'),
            status: 500,
            url: jasmine.stringMatching('/throw'),
          })
        )
      },
      done
    )
  })

  it('should track network error', (done) => {
    xhrSpec(
      (xhr) => {
        xhr.open('GET', 'http://foo.bar/qux')
        xhr.send()
      },
      () => {
        expect(notifySpy).toHaveBeenCalledWith(
          jasmine.objectContaining({
            method: 'GET',
            response: '',
            status: 0,
            url: 'http://foo.bar/qux',
          })
        )
      },
      done
    )
  })

  it('should track successful request aborted', (done) => {
    const onReadyStateChange = jasmine.createSpy()
    xhrSpec(
      (xhr) => {
        xhr.onreadystatechange = onReadyStateChange
        xhr.addEventListener('load', () => xhr.abort())
        xhr.open('GET', '/ok')
        xhr.send()
      },
      (xhr) => {
        expect(xhr.status).toBe(0)
        expect(onReadyStateChange).toHaveBeenCalled()
        expect(notifySpy).toHaveBeenCalledWith(
          jasmine.objectContaining({
            method: 'GET',
            response: 'ok',
            status: 200,
            url: jasmine.stringMatching('/ok'),
          })
        )
      },
      done
    )
  })

  it('should track successful sync request', (done) => {
    xhrSpec(
      (xhr) => {
        xhr.open('GET', '/ok', false)
        xhr.send()
      },
      () => {
        expect(notifySpy).toHaveBeenCalledWith(
          jasmine.objectContaining({
            method: 'GET',
            response: 'ok',
            status: 200,
            url: jasmine.stringMatching('/ok'),
          })
        )
      },
      done
    )
  })

  it('should track request with onreadystatechange overridden', (done) => {
    xhrSpec(
      (xhr) => {
        xhr.open('GET', '/ok')
        xhr.send()
        xhr.onreadystatechange = () => undefined
      },
      () => {
        expect(notifySpy).toHaveBeenCalledWith(
          jasmine.objectContaining({
            method: 'GET',
            response: 'ok',
            status: 200,
            url: jasmine.stringMatching('/ok'),
          })
        )
      },
      done
    )
  })
})
