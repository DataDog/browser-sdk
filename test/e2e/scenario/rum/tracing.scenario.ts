import { createTest, EventRegistry } from '../../lib/framework'
import { browserExecuteAsync, sendXhr } from '../../lib/helpers/browser'
import { flushEvents } from '../../lib/helpers/sdk'

describe('tracing', () => {
  createTest('trace xhr')
    .withRum({ service: 'Service', allowedTracingOrigins: ['LOCATION_ORIGIN'] })
    .run(async ({ events }) => {
      const rawHeaders = await sendXhr(`/headers`, [
        ['x-foo', 'bar'],
        ['x-foo', 'baz'],
      ])
      checkRequestHeaders(rawHeaders)
      await flushEvents()
      checkTraceAssociatedToRumEvent(events)
    })

  createTest('trace fetch')
    .withRum({ service: 'Service', allowedTracingOrigins: ['LOCATION_ORIGIN'] })
    .run(async ({ events }) => {
      const rawHeaders = await browserExecuteAsync<string>((done) => {
        window
          .fetch('/headers', {
            headers: [
              ['x-foo', 'bar'],
              ['x-foo', 'baz'],
            ],
          })
          .then((response) => response.text())
          .then(done)
      })
      checkRequestHeaders(rawHeaders)
      await flushEvents()
      await checkTraceAssociatedToRumEvent(events)
    })

  createTest('trace fetch with Request argument')
    .withRum({ service: 'Service', allowedTracingOrigins: ['LOCATION_ORIGIN'] })
    .run(async ({ events }) => {
      const rawHeaders = await browserExecuteAsync<string>((done) => {
        window
          .fetch(new Request('/headers', { headers: { 'x-foo': 'bar, baz' } }))
          .then((response) => response.text())
          .then(done)
      })
      checkRequestHeaders(rawHeaders)
      await flushEvents()
      checkTraceAssociatedToRumEvent(events)
    })

  function checkRequestHeaders(rawHeaders: string) {
    const headers: { [key: string]: string } = JSON.parse(rawHeaders)
    expect(headers['x-datadog-trace-id']).toMatch(/\d+/)
    expect(headers['x-datadog-origin']).toBe('rum')
    expect(headers['x-foo']).toBe('bar, baz')
  }

  function checkTraceAssociatedToRumEvent(events: EventRegistry) {
    const requests = events.rumResources.filter(
      (event) => event.resource.type === 'xhr' || event.resource.type === 'fetch'
    )
    expect(requests.length).toBe(1)
    expect(requests[0]._dd.trace_id).toMatch(/\d+/) // eslint-disable-line no-underscore-dangle
    expect(requests[0]._dd.span_id).toMatch(/\d+/) // eslint-disable-line no-underscore-dangle
    expect(requests[0].resource.id).toBeDefined()
  }
})
