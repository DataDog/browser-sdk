import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Configuration } from '../domain/configuration'
import { withXhr, mockXhr } from '../../test'
import type { Subscription } from '../tools/observable'
import type { XhrCompleteContext, XhrContext } from './xhrObservable'
import { initXhrObservable } from './xhrObservable'

describe('xhr observable', () => {
  let requestsTrackingSubscription: Subscription
  let contextEditionSubscription: Subscription | undefined
  let requests: XhrCompleteContext[]
  let originalMockXhrSend: XMLHttpRequest['send']
  let configuration: Configuration

  beforeEach(() => {
    mockXhr()
    configuration = {} as Configuration
    // eslint-disable-next-line @typescript-eslint/unbound-method
    originalMockXhrSend = XMLHttpRequest.prototype.send

    requests = []
    startTrackingRequests()
  })

  afterEach(() => {
    requestsTrackingSubscription.unsubscribe()
    contextEditionSubscription?.unsubscribe()
  })

  function startTrackingRequests() {
    requestsTrackingSubscription = initXhrObservable(configuration).subscribe((context) => {
      if (context.state === 'complete') {
        requests.push(context)
      }
    })
  }

  it('should track successful request', () =>
    new Promise<void>((resolve) => {
      withXhr({
        setup(xhr) {
          xhr.open('GET', '/ok')
          xhr.send()
          xhr.complete(200, 'ok')
        },
        onComplete() {
          const request = requests[0]
          expect(request.method).toBe('GET')
          expect(request.url).toContain('/ok')
          expect(request.status).toBe(200)
          expect(request.isAborted).toBe(false)
          expect(request.duration).toEqual(expect.any(Number))
          expect(request.handlingStack).toBeDefined()
          resolve()
        },
      })
    }))

  it('should sanitize request method', () =>
    new Promise<void>((resolve) => {
      withXhr({
        setup(xhr) {
          xhr.open('get', '/ok')
          xhr.send()
          xhr.complete(200, 'ok')
        },
        onComplete() {
          const request = requests[0]
          expect(request.method).toBe('GET')
          expect(request.handlingStack).toBeDefined()
          resolve()
        },
      })
    }))

  it('should track client error', () =>
    new Promise<void>((resolve) => {
      withXhr({
        setup(xhr) {
          xhr.open('GET', '/expected-404')
          xhr.send()
          xhr.complete(404, 'NOT FOUND')
        },
        onComplete() {
          const request = requests[0]
          expect(request.method).toBe('GET')
          expect(request.url).toContain('/expected-404')
          expect(request.status).toBe(404)
          expect(request.isAborted).toBe(false)
          expect(request.duration).toEqual(expect.any(Number))
          expect(request.handlingStack).toBeDefined()
          resolve()
        },
      })
    }))

  it('should track server error', () =>
    new Promise<void>((resolve) => {
      withXhr({
        setup(xhr) {
          xhr.open('GET', '/throw')
          xhr.send()
          xhr.complete(500, 'expected server error')
        },
        onComplete() {
          const request = requests[0]
          expect(request.method).toBe('GET')
          expect(request.url).toContain('/throw')
          expect(request.status).toBe(500)
          expect(request.isAborted).toBe(false)
          expect(request.duration).toEqual(expect.any(Number))
          expect(request.handlingStack).toBeDefined()
          resolve()
        },
      })
    }))

  it('should track network error', () =>
    new Promise<void>((resolve) => {
      withXhr({
        setup(xhr) {
          xhr.open('GET', 'http://foo.bar/qux')
          xhr.send()
          xhr.complete(0, '')
        },
        onComplete() {
          const request = requests[0]
          expect(request.method).toBe('GET')
          expect(request.url).toBe('http://foo.bar/qux')
          expect(request.status).toBe(0)
          expect(request.isAborted).toBe(false)
          expect(request.duration).toEqual(expect.any(Number))
          expect(request.handlingStack).toBeDefined()
          resolve()
        },
      })
    }))

  it('should track successful request aborted', () =>
    new Promise<void>((resolve) => {
      withXhr({
        setup(xhr) {
          xhr.onreadystatechange = () => {
            if (xhr.readyState === XMLHttpRequest.DONE) {
              xhr.abort()
            }
          }
          vi.spyOn(xhr, 'onreadystatechange')
          xhr.open('GET', '/ok')
          xhr.send()
          xhr.complete(200, 'ok')
        },
        onComplete(xhr) {
          const request = requests[0]
          expect(requests.length).toBe(1)
          expect(request.method).toBe('GET')
          expect(request.url).toContain('/ok')
          expect(request.status).toBe(200)
          expect(request.duration).toEqual(expect.any(Number))
          expect(request.isAborted).toBe(false)
          expect(xhr.status).toBe(0)
          expect(xhr.onreadystatechange).toHaveBeenCalledTimes(1)
          expect(request.handlingStack).toBeDefined()
          resolve()
        },
      })
    }))

  it('should track aborted requests', () =>
    new Promise<void>((resolve) => {
      withXhr({
        setup(xhr) {
          xhr.open('GET', '/ok')
          xhr.send()
          xhr.abort()
        },
        onComplete(xhr) {
          const request = requests[0]
          expect(request.method).toBe('GET')
          expect(request.url).toContain('/ok')
          expect(request.status).toBe(0)
          expect(request.duration).toEqual(expect.any(Number))
          expect(request.isAborted).toBe(true)
          expect(xhr.status).toBe(0)
          expect(request.handlingStack).toBeDefined()
          resolve()
        },
      })
    }))

  it('should track request with onreadystatechange overridden before open', () =>
    new Promise<void>((resolve) => {
      withXhr({
        setup(xhr) {
          xhr.onreadystatechange = vi.fn()
          xhr.open('GET', '/ok')
          xhr.send()
          xhr.complete(200, 'ok')
        },
        onComplete(xhr) {
          const request = requests[0]
          expect(request.method).toBe('GET')
          expect(request.url).toContain('/ok')
          expect(request.status).toBe(200)
          expect(request.isAborted).toBe(false)
          expect(request.duration).toEqual(expect.any(Number))
          expect(xhr.onreadystatechange).toHaveBeenCalled()
          expect(request.handlingStack).toBeDefined()
          resolve()
        },
      })
    }))

  it('should track request with onreadystatechange overridden after open', () =>
    new Promise<void>((resolve) => {
      withXhr({
        setup(xhr) {
          xhr.open('GET', '/ok')
          xhr.send()
          xhr.onreadystatechange = vi.fn()
          xhr.complete(200, 'ok')
        },
        onComplete(xhr) {
          const request = requests[0]
          expect(request.method).toBe('GET')
          expect(request.url).toContain('/ok')
          expect(request.status).toBe(200)
          expect(request.isAborted).toBe(false)
          expect(request.duration).toEqual(expect.any(Number))
          expect(xhr.onreadystatechange).toHaveBeenCalled()
          expect(request.handlingStack).toBeDefined()
          resolve()
        },
      })
    }))

  it('should allow to enhance the context', () =>
    new Promise<void>((resolve) => {
      type CustomContext = XhrContext & { foo: string }
      contextEditionSubscription = initXhrObservable(configuration).subscribe((rawContext) => {
        const context = rawContext as CustomContext
        if (context.state === 'start') {
          context.foo = 'bar'
        }
      })
      withXhr({
        setup(xhr) {
          xhr.open('GET', '/ok')
          xhr.send()
          xhr.complete(200)
        },
        onComplete() {
          const request = requests[0]
          expect((request as CustomContext).foo).toBe('bar')
          resolve()
        },
      })
    }))

  it('should not break xhr opened before the instrumentation', () =>
    new Promise<void>((resolve) => {
      requestsTrackingSubscription.unsubscribe()
      withXhr({
        setup(xhr) {
          xhr.open('GET', '/ok')
          startTrackingRequests()
          xhr.send()
          xhr.complete(200)
        },
        onComplete() {
          expect(requests.length).toBe(0)
          resolve()
        },
      })
    }))

  it('should track multiple requests with the same xhr instance', () =>
    new Promise<void>((resolve) => {
      let listeners: { [k: string]: Array<(event: Event) => void> }
      withXhr({
        setup(xhr) {
          const secondOnload = () => {
            xhr.removeEventListener('load', secondOnload)
          }
          const onLoad = () => {
            xhr.removeEventListener('load', onLoad)
            xhr.addEventListener('load', secondOnload)
            xhr.open('GET', '/ok?request=2')
            xhr.send()
            xhr.complete(400, 'ok')
          }
          xhr.onreadystatechange = vi.fn()
          xhr.addEventListener('load', onLoad)
          xhr.open('GET', '/ok?request=1')
          xhr.send()
          xhr.complete(200, 'ok')
          listeners = xhr.listeners
        },
        onComplete(xhr) {
          const firstRequest = requests[0]
          expect(firstRequest.method).toBe('GET')
          expect(firstRequest.url).toContain('/ok?request=1')
          expect(firstRequest.status).toBe(200)
          expect(firstRequest.isAborted).toBe(false)
          expect(firstRequest.duration).toEqual(expect.any(Number))
          expect(firstRequest.handlingStack).toBeDefined()

          const secondRequest = requests[1]
          expect(secondRequest.method).toBe('GET')
          expect(secondRequest.url).toContain('/ok?request=2')
          expect(secondRequest.status).toBe(400)
          expect(secondRequest.isAborted).toBe(false)
          expect(secondRequest.duration).toEqual(expect.any(Number))
          expect(secondRequest.handlingStack).toBeDefined()

          expect(xhr.onreadystatechange).toHaveBeenCalledTimes(2)
          expect(listeners.load.length).toBe(0)
          expect(listeners.loadend.length).toBe(0)
          resolve()
        },
      })
    }))

  it('should track request to undefined url', () =>
    new Promise<void>((resolve) => {
      withXhr({
        setup(xhr) {
          xhr.open('GET', undefined)
          xhr.send()
          xhr.complete(404, 'NOT FOUND')
        },
        onComplete() {
          const request = requests[0]
          expect(request.method).toBe('GET')
          expect(request.url).toContain('/undefined')
          expect(request.status).toBe(404)
          resolve()
        },
      })
    }))

  it('should track request to null url', () =>
    new Promise<void>((resolve) => {
      withXhr({
        setup(xhr) {
          xhr.open('GET', null)
          xhr.send()
          xhr.complete(404, 'NOT FOUND')
        },
        onComplete() {
          const request = requests[0]
          expect(request.method).toBe('GET')
          expect(request.url).toContain('/null')
          expect(request.status).toBe(404)
          resolve()
        },
      })
    }))

  it('should track request to URL object', () =>
    new Promise<void>((resolve) => {
      withXhr({
        setup(xhr) {
          xhr.open('GET', new URL('http://example.com/path'))
          xhr.send()
          xhr.complete(200, 'ok')
        },
        onComplete() {
          const request = requests[0]
          expect(request.method).toBe('GET')
          expect(request.url).toBe('http://example.com/path')
          resolve()
        },
      })
    }))

  describe('when unsubscribing', () => {
    it('should stop tracking requests', () =>
      new Promise<void>((resolve) => {
        requestsTrackingSubscription.unsubscribe()

        withXhr({
          setup(xhr) {
            xhr.open('GET', '/ok')
            xhr.send()
            xhr.complete(200)
          },
          onComplete() {
            expect(requests.length).toBe(0)
            resolve()
          },
        })
      }))

    it('should restore original XMLHttpRequest methods', () => {
      requestsTrackingSubscription.unsubscribe()

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(XMLHttpRequest.prototype.send).toBe(originalMockXhrSend)
    })
  })

  it('should track request with undefined or null methods', () =>
    new Promise<void>((resolve) => {
      withXhr({
        setup(xhr) {
          xhr.open(null, '/ok')
          xhr.send()
          xhr.onreadystatechange = vi.fn()
          xhr.complete(200, 'ok')
          xhr.open(undefined, '/ok')
          xhr.send()
          xhr.onreadystatechange = vi.fn()
          xhr.complete(200, 'ok')
        },
        onComplete() {
          expect(requests[0].method).toBe('NULL')
          expect(requests[1].method).toBe('UNDEFINED')
          resolve()
        },
      })
    }))
})
