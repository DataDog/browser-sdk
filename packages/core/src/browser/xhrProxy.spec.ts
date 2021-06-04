import { stubXhr, withXhr } from '../../test/specHelper'
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
        expect(request.isAborted).toBe(false)
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
        expect(request.isAborted).toBe(false)
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
        expect(request.isAborted).toBe(false)
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
        expect(request.isAborted).toBe(false)
        expect(request.startTime).toEqual(jasmine.any(Number))
        expect(request.duration).toEqual(jasmine.any(Number))
        done()
      },
    })
  })

  it('should track successful request aborted when onreadystatechange is overridden before open', (done) => {
    withXhr({
      setup(xhr) {
        xhr.onreadystatechange = () => {
          if (xhr.readyState === XMLHttpRequest.DONE) {
            xhr.abort()
          }
        }
        spyOn(xhr, 'onreadystatechange').and.callThrough()
        xhr.open('GET', '/ok')
        xhr.send()
        xhr.complete(200, 'ok')
      },
      onComplete(xhr) {
        const request = getRequest(0)
        expect(completeSpy.calls.count()).toBe(1)
        expect(request.method).toBe('GET')
        expect(request.url).toContain('/ok')
        expect(request.response).toBe('ok')
        expect(request.status).toBe(200)
        expect(request.startTime).toEqual(jasmine.any(Number))
        expect(request.duration).toEqual(jasmine.any(Number))
        expect(request.isAborted).toBe(false)
        expect(xhr.status).toBe(0)
        expect(xhr.onreadystatechange).toHaveBeenCalledTimes(1)
        expect()
        done()
      },
    })
  })

  it('should track successful request aborted when onreadystatechange overridden after open', (done) => {
    withXhr({
      setup(xhr) {
        xhr.open('GET', '/ok')
        xhr.onreadystatechange = () => {
          if (xhr.readyState === XMLHttpRequest.DONE) {
            xhr.abort()
          }
        }
        spyOn(xhr, 'onreadystatechange').and.callThrough()
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
        expect(request.isAborted).toBe(false)
        expect(xhr.status).toBe(0)
        expect(xhr.onreadystatechange).toHaveBeenCalledTimes(1)
        done()
      },
    })
  })

  it('should track aborted requests', (done) => {
    withXhr({
      setup(xhr) {
        xhr.open('GET', '/ok')
        xhr.send()
        xhr.abort()
      },
      onComplete(xhr) {
        const request = getRequest(0)
        expect(request.method).toBe('GET')
        expect(request.url).toContain('/ok')
        expect(request.response).toBeUndefined()
        expect(request.status).toBe(0)
        expect(request.startTime).toEqual(jasmine.any(Number))
        expect(request.duration).toEqual(jasmine.any(Number))
        expect(request.isAborted).toBe(true)
        expect(xhr.status).toBe(0)
        done()
      },
    })
  })

  it('should track request with onreadystatechange overridden before open', (done) => {
    withXhr({
      setup(xhr) {
        xhr.onreadystatechange = () => undefined
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
        expect(request.isAborted).toBe(false)
        expect(request.startTime).toEqual(jasmine.any(Number))
        expect(request.duration).toEqual(jasmine.any(Number))
        done()
      },
    })
  })

  it('should track request with onreadystatechange overridden after open', (done) => {
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
        expect(request.isAborted).toBe(false)
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

  it('should not break xhr opened before the instrumentation', (done) => {
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

  it('should track multiple requests with the same xhr instance', (done) => {
    let listeners: { [k: string]: Array<() => void> }
    withXhr({
      completionMode: 'manual',
      setup(xhr, complete) {
        const secondOnload = () => {
          xhr.removeEventListener('load', secondOnload)
          complete(xhr)
        }
        const onLoad = () => {
          xhr.removeEventListener('load', onLoad)
          xhr.addEventListener('load', secondOnload)
          xhr.open('GET', '/ok?request=1')
          xhr.send()
          xhr.complete(400, 'ok')
        }
        xhr.onreadystatechange = jasmine.createSpy()
        xhr.addEventListener('load', onLoad)
        xhr.open('GET', '/ok?request=1')
        xhr.send()
        xhr.complete(200, 'ok')
        listeners = xhr.listeners
      },
      onComplete(xhr) {
        const firstRequest = getRequest(0)
        expect(firstRequest.method).toBe('GET')
        expect(firstRequest.status).toBe(200)
        expect(firstRequest.isAborted).toBe(false)
        expect(firstRequest.startTime).toEqual(jasmine.any(Number))
        expect(firstRequest.duration).toEqual(jasmine.any(Number))

        const secondRequest = getRequest(1)
        expect(secondRequest.method).toBe('GET')
        expect(secondRequest.status).toBe(400)
        expect(secondRequest.isAborted).toBe(false)
        expect(secondRequest.startTime).toEqual(jasmine.any(Number))
        expect(secondRequest.duration).toEqual(jasmine.any(Number))

        expect(xhr.onreadystatechange).toHaveBeenCalledTimes(2)
        expect(listeners.load.length).toBe(0)
        expect(listeners.loadend.length).toBe(0)
        expect(listeners.readystatechange.length).toBe(0)
        done()
      },
    })
  })
})
