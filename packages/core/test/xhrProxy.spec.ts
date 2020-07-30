import { withXhr } from '../src'
import { resetXhrProxy, startXhrProxy, XhrContext, XhrProxy } from '../src/xhrProxy'

describe('xhr proxy', () => {
  let completeSpy: jasmine.Spy<(context: XhrContext) => void>
  let xhrProxy: XhrProxy

  function getRequest(index: number) {
    return completeSpy.calls.argsFor(index)[0]
  }

  beforeEach(() => {
    completeSpy = jasmine.createSpy('complete')
    xhrProxy = startXhrProxy()
    xhrProxy.onRequestComplete(completeSpy)
  })

  afterEach(() => {
    resetXhrProxy()
  })

  it('should track successful request', (done) => {
    withXhr({
      setup(xhr) {
        xhr.open('GET', '/ok')
        xhr.send()
      },
      onComplete() {
        const request = getRequest(0)
        expect(request.method).toBe('GET')
        expect(request.url).toContain('/ok')
        expect(request.response).toBe('ok')
        expect(request.status).toBe(200)
        expect(request.startTime).toEqual(jasmine.any(Number))
        expect(request.duration).toEqual(jasmine.any(Number))
        done()
      },
    })
  })

  it('should track client error', (done) => {
    withXhr({
      setup(xhr) {
        xhr.open('GET', '/expected-404')
        xhr.send()
      },
      onComplete() {
        const request = getRequest(0)
        expect(request.method).toBe('GET')
        expect(request.url).toContain('/expected-404')
        expect(request.response).toBe('NOT FOUND')
        expect(request.status).toBe(404)
        expect(request.startTime).toEqual(jasmine.any(Number))
        expect(request.duration).toEqual(jasmine.any(Number))
        done()
      },
    })
  })

  it('should track server error', (done) => {
    withXhr({
      setup(xhr) {
        xhr.open('GET', '/throw')
        xhr.send()
      },
      onComplete() {
        const request = getRequest(0)
        expect(request.method).toBe('GET')
        expect(request.url).toContain('/throw')
        expect(request.response).toEqual(jasmine.stringMatching('expected server error'))
        expect(request.status).toBe(500)
        expect(request.startTime).toEqual(jasmine.any(Number))
        expect(request.duration).toEqual(jasmine.any(Number))
        done()
      },
    })
  })

  it('should track network error', (done) => {
    withXhr({
      setup(xhr) {
        xhr.open('GET', 'http://foo.bar/qux')
        xhr.send()
      },
      onComplete() {
        const request = getRequest(0)
        expect(request.method).toBe('GET')
        expect(request.url).toBe('http://foo.bar/qux')
        expect(request.response).toBe('')
        expect(request.status).toBe(0)
        expect(request.startTime).toEqual(jasmine.any(Number))
        expect(request.duration).toEqual(jasmine.any(Number))
        done()
      },
    })
  })

  it('should track successful request aborted', (done) => {
    const onReadyStateChange = jasmine.createSpy()
    withXhr({
      setup(xhr) {
        xhr.onreadystatechange = onReadyStateChange
        xhr.addEventListener('load', () => xhr.abort())
        xhr.open('GET', '/ok')
        xhr.send()
      },
      onComplete(xhr) {
        const request = getRequest(0)
        expect(request.method).toBe('GET')
        expect(request.url).toContain('/ok')
        expect(request.response).toBe('ok')
        expect(request.status).toBe(200)
        expect(request.startTime).toEqual(jasmine.any(Number))
        expect(request.duration).toEqual(jasmine.any(Number))
        expect(xhr.status).toBe(0)
        expect(onReadyStateChange).toHaveBeenCalled()
        done()
      },
    })
  })

  it('should track successful sync request', (done) => {
    withXhr({
      setup(xhr) {
        xhr.open('GET', '/ok', false)
        xhr.send()
      },
      onComplete() {
        const request = getRequest(0)
        expect(request.method).toBe('GET')
        expect(request.url).toContain('/ok')
        expect(request.response).toBe('ok')
        expect(request.status).toBe(200)
        expect(request.startTime).toEqual(jasmine.any(Number))
        expect(request.duration).toEqual(jasmine.any(Number))
        done()
      },
    })
  })

  it('should track request with onreadystatechange overridden', (done) => {
    withXhr({
      setup(xhr) {
        xhr.open('GET', '/ok')
        xhr.send()
        xhr.onreadystatechange = () => undefined
      },
      onComplete() {
        const request = getRequest(0)
        expect(request.method).toBe('GET')
        expect(request.url).toContain('/ok')
        expect(request.response).toBe('ok')
        expect(request.status).toBe(200)
        expect(request.startTime).toEqual(jasmine.any(Number))
        expect(request.duration).toEqual(jasmine.any(Number))
        done()
      },
    })
  })

  it('should allow to enhance the context', (done) => {
    xhrProxy.beforeSend((xhrContext) => {
      xhrContext.foo = 'bar'
    })
    withXhr({
      setup(xhr) {
        xhr.open('GET', '/ok')
        xhr.send()
      },
      onComplete() {
        const request = getRequest(0)
        expect(request.foo).toBe('bar')
        done()
      },
    })
  })
})
