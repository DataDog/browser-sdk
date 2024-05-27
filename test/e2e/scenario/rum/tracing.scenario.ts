import type { IntakeRegistry } from '../../lib/framework'
import { flushEvents, createTest } from '../../lib/framework'
import { sendXhr } from '../../lib/helpers/browser'

describe('tracing', () => {
  createTest('trace xhr')
    .withRum({ allowedTracingUrls: ['LOCATION_ORIGIN'], service: 'service' })
    .run(async ({ intakeRegistry }) => {
      const rawHeaders = await sendXhr('/headers', [
        ['x-foo', 'bar'],
        ['x-foo', 'baz'],
      ])
      const headers = parseHeaders(rawHeaders)
      checkRequestHeaders(headers)
      expect(headers['x-foo']).toBe('bar, baz')
      await flushEvents()
      checkTraceAssociatedToRumEvent(intakeRegistry)
    })

  createTest('trace fetch')
    .withRum({ allowedTracingUrls: ['LOCATION_ORIGIN'], service: 'service' })
    .run(async ({ intakeRegistry }) => {
      const rawHeaders = await browser.executeAsync<string | Error, []>((done) => {
        window
          .fetch('/headers', {
            headers: [
              ['x-foo', 'bar'],
              ['x-foo', 'baz'],
            ],
          })
          .then((response) => response.text())
          .then(done)
          .catch(() => done(new Error('Fetch request failed!')))
      })
      const headers = parseHeaders(rawHeaders)
      checkRequestHeaders(headers)
      expect(headers['x-foo']).toBe('bar, baz')
      await flushEvents()
      checkTraceAssociatedToRumEvent(intakeRegistry)
    })

  createTest('trace fetch with Request argument')
    .withRum({ allowedTracingUrls: ['LOCATION_ORIGIN'], service: 'service' })
    .run(async ({ intakeRegistry }) => {
      const rawHeaders = await browser.executeAsync<string | Error, []>((done) => {
        window
          .fetch(new Request('/headers', { headers: { 'x-foo': 'bar, baz' } }))
          .then((response) => response.text())
          .then(done)
          .catch(() => done(new Error('Fetch request failed!')))
      })
      const headers = parseHeaders(rawHeaders)
      checkRequestHeaders(headers)
      expect(headers['x-foo']).toBe('bar, baz')
      await flushEvents()
      checkTraceAssociatedToRumEvent(intakeRegistry)
    })

  createTest('trace single argument fetch')
    .withRum({ allowedTracingUrls: ['LOCATION_ORIGIN'], service: 'service' })
    .run(async ({ intakeRegistry }) => {
      const rawHeaders = await browser.executeAsync<string | Error, []>((done) => {
        window
          .fetch('/headers')
          .then((response) => response.text())
          .then(done)
          .catch(() => done(new Error('Fetch request failed!')))
      })
      const headers = parseHeaders(rawHeaders)
      checkRequestHeaders(headers)
      await flushEvents()
      checkTraceAssociatedToRumEvent(intakeRegistry)
    })

  interface ParsedHeaders {
    [key: string]: string
  }

  function parseHeaders(rawHeaders: string | Error): ParsedHeaders {
    if (rawHeaders instanceof Error) {
      fail(rawHeaders)
      return {}
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return JSON.parse(rawHeaders)
  }

  // By default, we send both Datadog and W3C tracecontext headers
  function checkRequestHeaders(headers: ParsedHeaders) {
    expect(headers['x-datadog-trace-id']).toMatch(/\d+/)
    expect(headers['x-datadog-origin']).toBe('rum')
    expect(headers['traceparent']).toMatch(/^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-01$/)
  }

  function checkTraceAssociatedToRumEvent(intakeRegistry: IntakeRegistry) {
    const requests = intakeRegistry.rumResourceEvents.filter(
      (event) => event.resource.type === 'xhr' || event.resource.type === 'fetch'
    )
    expect(requests.length).toBe(1)
    expect(requests[0]._dd.trace_id).toMatch(/\d+/)
    expect(requests[0]._dd.span_id).toMatch(/\d+/)
    expect(requests[0].resource.id).toBeDefined()
  }
})
