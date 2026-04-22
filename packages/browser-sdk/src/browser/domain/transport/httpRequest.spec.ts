import { createHttpRequest, RECOMMENDED_BYTES_LIMIT } from './httpRequest'
import type { HttpRequest, Payload } from './httpRequest'

const ENDPOINT_URL = 'https://example.com/intake'

function makePayload(bytesCount: number, data = 'test-data'): Payload {
  return { data, bytesCount }
}

describe('createHttpRequest', () => {
  let fetchSpy: jasmine.Spy
  let request: HttpRequest

  beforeEach(() => {
    fetchSpy = spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response(null, { status: 200 })))
    request = createHttpRequest({ endpointUrl: ENDPOINT_URL })
  })

  describe('send() — basic', () => {
    it('sends a POST request via fetch', (done) => {
      request.send(makePayload(10))
      setTimeout(() => {
        expect(fetchSpy).toHaveBeenCalledTimes(1)
        const [, init] = fetchSpy.calls.mostRecent().args as [string, RequestInit]
        expect(init.method).toBe('POST')
        done()
      }, 0)
    })

    it('does not set Content-Type header', (done) => {
      request.send(makePayload(10))
      setTimeout(() => {
        const [, init] = fetchSpy.calls.mostRecent().args as [string, RequestInit]
        const headers = init.headers as Record<string, string> | undefined
        expect(headers?.['Content-Type']).toBeUndefined()
        done()
      }, 0)
    })

    it('uses the configured endpoint URL', (done) => {
      request.send(makePayload(10))
      setTimeout(() => {
        const [url] = fetchSpy.calls.mostRecent().args as [string, RequestInit]
        expect(url).toBe(ENDPOINT_URL)
        done()
      }, 0)
    })
  })

  describe('send() — retry', () => {
    beforeEach(() => {
      jasmine.clock().install()
    })

    afterEach(() => {
      jasmine.clock().uninstall()
    })

    it('retries on status 429', (done) => {
      let callCount = 0
      fetchSpy.and.callFake(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve(new Response(null, { status: 429 }))
        }
        return Promise.resolve(new Response(null, { status: 200 }))
      })

      request.send(makePayload(10))

      // Let first fetch resolve
      Promise.resolve().then(() => {
        Promise.resolve().then(() => {
          // Transport is DOWN, tick past initial backoff
          jasmine.clock().tick(1000)
          Promise.resolve().then(() => {
            Promise.resolve().then(() => {
              expect(fetchSpy).toHaveBeenCalledTimes(2)
              done()
            })
          })
        })
      })
    })

    it('retries on status 500', (done) => {
      let callCount = 0
      fetchSpy.and.callFake(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve(new Response(null, { status: 500 }))
        }
        return Promise.resolve(new Response(null, { status: 200 }))
      })

      request.send(makePayload(10))

      Promise.resolve().then(() => {
        Promise.resolve().then(() => {
          jasmine.clock().tick(1000)
          Promise.resolve().then(() => {
            Promise.resolve().then(() => {
              expect(fetchSpy).toHaveBeenCalledTimes(2)
              done()
            })
          })
        })
      })
    })

    it('retries on status 0 when offline', (done) => {
      spyOnProperty(navigator, 'onLine').and.returnValue(false)

      let callCount = 0
      fetchSpy.and.callFake(() => {
        callCount++
        if (callCount === 1) {
          // status 0 is produced by a network error (fetch rejects)
          return Promise.reject(new Error('network error'))
        }
        return Promise.resolve(new Response(null, { status: 200 }))
      })

      request.send(makePayload(10))

      Promise.resolve().then(() => {
        Promise.resolve().then(() => {
          jasmine.clock().tick(1000)
          Promise.resolve().then(() => {
            Promise.resolve().then(() => {
              expect(fetchSpy).toHaveBeenCalledTimes(2)
              done()
            })
          })
        })
      })
    })

    it('does not retry on status 400', (done) => {
      fetchSpy.and.returnValue(Promise.resolve(new Response(null, { status: 400 })))

      request.send(makePayload(10))

      Promise.resolve().then(() => {
        Promise.resolve().then(() => {
          jasmine.clock().tick(5000)
          expect(fetchSpy).toHaveBeenCalledTimes(1)
          done()
        })
      })
    })

    it('does not retry on status 200', (done) => {
      fetchSpy.and.returnValue(Promise.resolve(new Response(null, { status: 200 })))

      request.send(makePayload(10))

      Promise.resolve().then(() => {
        Promise.resolve().then(() => {
          jasmine.clock().tick(5000)
          expect(fetchSpy).toHaveBeenCalledTimes(1)
          done()
        })
      })
    })

    it('uses exponential backoff: first retry after 1s, second after 2s', (done) => {
      let callCount = 0
      fetchSpy.and.callFake(() => {
        callCount++
        if (callCount < 3) {
          return Promise.resolve(new Response(null, { status: 500 }))
        }
        return Promise.resolve(new Response(null, { status: 200 }))
      })

      request.send(makePayload(10))

      // after initial send fails, tick 1s for first retry
      Promise.resolve().then(() => {
        Promise.resolve().then(() => {
          expect(fetchSpy).toHaveBeenCalledTimes(1)
          jasmine.clock().tick(1000)

          Promise.resolve().then(() => {
            Promise.resolve().then(() => {
              expect(fetchSpy).toHaveBeenCalledTimes(2)
              // second retry after 2s (doubled)
              jasmine.clock().tick(2000)

              Promise.resolve().then(() => {
                Promise.resolve().then(() => {
                  expect(fetchSpy).toHaveBeenCalledTimes(3)
                  done()
                })
              })
            })
          })
        })
      })
    })
  })

  describe('send() — bandwidth', () => {
    it('queues payload when ongoing bytes would exceed 80 KiB', (done) => {
      // Create a request that fills bandwidth (80 KiB - 10 bytes)
      const firstPayload = makePayload(80 * 1024 - 10)
      // This second payload would push bytes over 80 KiB
      const secondPayload = makePayload(20)

      request.send(firstPayload)
      request.send(secondPayload)

      // Only 1 fetch call should happen (first payload sent, second queued)
      expect(fetchSpy).toHaveBeenCalledTimes(1)

      done()
    })

    it('queues payload when ongoing requests reach 32', (done) => {
      // Fill up MAX_ONGOING_REQUESTS slots (32) each with 1 byte
      for (let i = 0; i < 32; i++) {
        request.send(makePayload(1))
      }
      expect(fetchSpy).toHaveBeenCalledTimes(32)

      // 33rd should be queued
      request.send(makePayload(1))
      expect(fetchSpy).toHaveBeenCalledTimes(32)

      done()
    })

    it('first request always sends even if large', (done) => {
      const bigPayload = makePayload(200 * 1024) // 200 KiB, way over limit
      request.send(bigPayload)
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      done()
    })
  })

  describe('send() — queue', () => {
    it('retries queued payloads after successful send', (done) => {
      // Fill bandwidth so second payload is queued
      const bigPayload = makePayload(80 * 1024 - 10)
      const smallPayload = makePayload(20)

      request.send(bigPayload)
      request.send(smallPayload)

      expect(fetchSpy).toHaveBeenCalledTimes(1)

      // Let the first fetch resolve successfully
      Promise.resolve().then(() => {
        Promise.resolve().then(() => {
          // After first resolves, queued payload should be sent
          expect(fetchSpy).toHaveBeenCalledTimes(2)
          done()
        })
      })
    })

    it('drops payloads when queue exceeds 20 MiB', (done) => {
      const MAX_QUEUE_BYTES = 20 * 1024 * 1024

      // Put one payload in-flight to trigger queueing
      const bigPayload = makePayload(80 * 1024)
      request.send(bigPayload)

      // Fill the queue to capacity
      request.send(makePayload(MAX_QUEUE_BYTES))

      const fetchCallsBefore = fetchSpy.calls.count()

      // This payload should be dropped (queue is full)
      request.send(makePayload(1))

      // fetch count shouldn't change (dropped payload doesn't trigger a send)
      expect(fetchSpy.calls.count()).toBe(fetchCallsBefore)

      done()
    })
  })

  describe('sendOnExit()', () => {
    it('uses sendBeacon when payload < 16 KiB', () => {
      const beaconSpy = spyOn(navigator, 'sendBeacon').and.returnValue(true)

      request.sendOnExit(makePayload(RECOMMENDED_BYTES_LIMIT - 1))

      expect(beaconSpy).toHaveBeenCalledTimes(1)
      expect(beaconSpy).toHaveBeenCalledWith(ENDPOINT_URL, 'test-data')
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('falls back to fetch when sendBeacon returns false', (done) => {
      spyOn(navigator, 'sendBeacon').and.returnValue(false)

      request.sendOnExit(makePayload(RECOMMENDED_BYTES_LIMIT - 1))

      setTimeout(() => {
        expect(fetchSpy).toHaveBeenCalledTimes(1)
        done()
      }, 0)
    })

    it('falls back to fetch when payload >= 16 KiB', (done) => {
      const beaconSpy = spyOn(navigator, 'sendBeacon').and.returnValue(true)

      request.sendOnExit(makePayload(RECOMMENDED_BYTES_LIMIT))

      setTimeout(() => {
        expect(beaconSpy).not.toHaveBeenCalled()
        expect(fetchSpy).toHaveBeenCalledTimes(1)
        done()
      }, 0)
    })
  })
})
