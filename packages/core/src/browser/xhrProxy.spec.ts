import { stubXhr, withXhr } from '../tools/specHelper'
import { resetXhrProxy, startXhrProxy, XhrCompleteContext, XhrProxy } from './xhrProxy'

describe('xhr proxy', () => {
  let completeSpy: jasmine.Spy<(context: XhrCompleteContext) => void>
  let xhrProxy: XhrProxy
  let stubXhrManager: { reset(): void }

  function getRequest(index: number) {
    return completeSpy.calls.argsFor(index)[0]
  }

  beforeEach(() => {
    stubXhrManager = stubXhr()
    completeSpy = jasmine.createSpy('complete')
    xhrProxy = startXhrProxy()
    xhrProxy.onRequestComplete(completeSpy)
  })

  afterEach(() => {
    resetXhrProxy()
    stubXhrManager.reset()
  })

  it('should track successful request', (done) => {
    withXhr({
      setup(xhr) {
        xhr.open('GET', '/ok')
        xhr.send()
        xhr.complete(200, 'ok')
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
        xhr.complete(404, 'NOT FOUND')
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
        xhr.complete(500, 'expected server error')
      },
      onComplete() {
        const request = getRequest(0)
        expect(request.method).toBe('GET')
        expect(request.url).toContain('/throw')
        expect(request.response).toEqual('expected server error')
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
        xhr.complete(0, '')
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
        xhr.complete(200, 'ok')
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

  it('should track request with onreadystatechange overridden', (done) => {
    withXhr({
      setup(xhr) {
        xhr.open('GET', '/ok')
        xhr.send()
        xhr.onreadystatechange = () => undefined
        xhr.complete(200, 'ok')
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
        xhr.complete(200)
      },
      onComplete() {
        const request = getRequest(0)
        expect(request.foo).toBe('bar')
        done()
      },
    })
  })

  it('should should not break xhr opened before the instrumentation', (done) => {
    resetXhrProxy()
    withXhr({
      setup(xhr) {
        xhr.open('GET', '/ok')
        startXhrProxy()
        xhr.send()
        xhr.complete(200)
      },
      onComplete() {
        expect(completeSpy.calls.count()).toBe(0)
        done()
      },
    })
  })
})
