import type { IntakeRegistry } from '../../lib/framework'
import { flushEvents, createTest } from '../../lib/framework'
import { browserExecuteAsync, sendXhr } from '../../lib/helpers/browser'

describe('tracing', () => {
  createTest('trace xhr')
    .withRum({ service: 'service', allowedTracingUrls: ['LOCATION_ORIGIN'] })
    .run(async ({ intakeRegistry }) => {
      const rawHeaders = await sendXhr('/headers', [
        ['x-foo', 'bar'],
        ['x-foo', 'baz'],
      ])
      checkRequestHeaders(rawHeaders)
      await flushEvents()
      checkTraceAssociatedToRumEvent(intakeRegistry)
    })

  createTest('trace fetch')
    .withRum({ service: 'service', allowedTracingUrls: ['LOCATION_ORIGIN'] })
    .run(async ({ intakeRegistry }) => {
      const rawHeaders = await browserExecuteAsync<string | Error>((done) => {
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
      if (rawHeaders instanceof Error) {
        return fail(rawHeaders)
      }
      checkRequestHeaders(rawHeaders)
      await flushEvents()
      checkTraceAssociatedToRumEvent(intakeRegistry)
    })

  createTest('trace fetch with Request argument')
    .withRum({ service: 'service', allowedTracingUrls: ['LOCATION_ORIGIN'] })
    .run(async ({ intakeRegistry }) => {
      const rawHeaders = await browserExecuteAsync<string | Error>((done) => {
        window
          .fetch(new Request('/headers', { headers: { 'x-foo': 'bar, baz' } }))
          .then((response) => response.text())
          .then(done)
          .catch(() => done(new Error('Fetch request failed!')))
      })
      if (rawHeaders instanceof Error) {
        return fail(rawHeaders)
      }
      checkRequestHeaders(rawHeaders)
      await flushEvents()
      checkTraceAssociatedToRumEvent(intakeRegistry)
    })

  // By default, we send both Datadog and W3C tracecontext headers
  function checkRequestHeaders(rawHeaders: string) {
    const headers: { [key: string]: string } = JSON.parse(rawHeaders)
    expect(headers['x-datadog-trace-id']).toMatch(/\d+/)
    expect(headers['x-datadog-origin']).toBe('rum')
    expect(headers['traceparent']).toMatch(/^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-01$/)
    expect(headers['x-foo']).toBe('bar, baz')
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
