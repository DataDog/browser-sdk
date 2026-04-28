import { Pipeline } from '@datadog/core-next'
import type { NetworkRequestResource } from '@datadog/core-next'
import { startXhrCollection } from './xhrCollector'

describe('startXhrCollection', () => {
  let pipeline: Pipeline<Record<string, unknown>>
  let stop: () => void
  let collected: NetworkRequestResource[]

  beforeEach(() => {
    pipeline = new Pipeline<Record<string, unknown>>()
    collected = []
    pipeline.subscribe('resource:network_request', (event) => {
      collected.push(event as NetworkRequestResource)
    })
    pipeline.seal()
    stop = startXhrCollection(pipeline)
  })

  afterEach(() => {
    stop()
  })

  it('publishes resource:network_request when XHR completes successfully', (done) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', '/base/karma.js')
    xhr.send()
    xhr.addEventListener('loadend', () => {
      // give the pipeline time to process (it's async)
      setTimeout(() => {
        expect(collected.length).toBe(1)
        done()
      }, 0)
    })
  })

  it('includes method, url, status in the resource', (done) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', '/base/karma.js')
    xhr.send()
    xhr.addEventListener('loadend', () => {
      setTimeout(() => {
        expect(collected[0].method).toBe('GET')
        expect(collected[0].url).toBe('/base/karma.js')
        expect(collected[0].status).toBeGreaterThan(0)
        done()
      }, 0)
    })
  })

  it('reports isAborted: false on normal completion', (done) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', '/base/karma.js')
    xhr.send()
    xhr.addEventListener('loadend', () => {
      setTimeout(() => {
        expect(collected[0].isAborted).toBe(false)
        done()
      }, 0)
    })
  })

  it('includes startTime, startDate, and duration', (done) => {
    const beforeStart = performance.now()
    const beforeDate = Date.now()
    const xhr = new XMLHttpRequest()
    xhr.open('GET', '/base/karma.js')
    xhr.send()
    xhr.addEventListener('loadend', () => {
      setTimeout(() => {
        expect(collected[0].startTime).toBeGreaterThanOrEqual(beforeStart)
        expect(collected[0].startDate).toBeGreaterThanOrEqual(beforeDate)
        expect(collected[0].duration).toBeGreaterThanOrEqual(0)
        done()
      }, 0)
    })
  })

  it('stop() restores original XHR methods', () => {
    const patchedOpen = XMLHttpRequest.prototype.open
    const patchedSend = XMLHttpRequest.prototype.send

    stop()

    // After stop, methods should be different from the patched versions
    expect(XMLHttpRequest.prototype.open).not.toBe(patchedOpen)
    expect(XMLHttpRequest.prototype.send).not.toBe(patchedSend)

    // Restart for afterEach to call stop() again safely
    stop = () => {} // noop, originals already restored
  })

  it('publishes signal:network_request_start when request begins', (done) => {
    let captured: { url: string; method: string } | undefined
    pipeline.subscribe('signal:network_request_start', (event) => {
      captured = event as { url: string; method: string }
    })

    const xhr = new XMLHttpRequest()
    xhr.open('GET', '/base/karma.js')
    xhr.send()
    xhr.addEventListener('loadend', () => {
      setTimeout(() => {
        expect(captured).toEqual({ url: '/base/karma.js', method: 'GET' })
        done()
      }, 0)
    })
  })

  it('does not publish after stop() is called', (done) => {
    stop()

    const xhr = new XMLHttpRequest()
    xhr.open('GET', '/base/karma.js')
    xhr.send()
    xhr.addEventListener('loadend', () => {
      setTimeout(() => {
        expect(collected.length).toBe(0)
        done()
      }, 0)
    })

    // Restart for afterEach to call stop() again without side effects
    stop = () => {}
  })
})
