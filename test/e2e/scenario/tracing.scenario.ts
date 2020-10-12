import { sendFetch, sendXhr } from '../lib/browserHelpers'
import { createTest, EventRegistry } from '../lib/framework'
import { flushEvents } from '../lib/sdkHelpers'

describe('tracing', () => {
  createTest('trace xhr')
    .withRum({ service: 'Service', allowedTracingOrigins: ['LOCATION_ORIGIN'] })
    .run(async ({ events }) => {
      const rawHeaders = await sendXhr(`/headers`, [['x-foo', 'bar'], ['x-foo', 'baz']])
      checkRequestHeaders(rawHeaders)
      await flushEvents()
      await checkTraceAssociatedToRumEvent(events)
    })

  createTest('trace fetch')
    .withRum({ service: 'Service', allowedTracingOrigins: ['LOCATION_ORIGIN'] })
    .run(async ({ events }) => {
      const rawHeaders = await sendFetch(`/headers`, [['x-foo', 'bar'], ['x-foo', 'baz']])
      checkRequestHeaders(rawHeaders)
      await flushEvents()
      await checkTraceAssociatedToRumEvent(events)
    })

  function checkRequestHeaders(rawHeaders: string) {
    const headers: { [key: string]: string } = JSON.parse(rawHeaders) as any
    expect(headers['x-datadog-trace-id']).toMatch(/\d+/)
    expect(headers['x-datadog-origin']).toBe('rum')
    expect(headers['x-foo']).toBe('bar, baz')
  }

  async function checkTraceAssociatedToRumEvent(events: EventRegistry) {
    const requests = events.rumResources.filter(
      (event) => event.resource.kind === 'xhr' || event.resource.kind === 'fetch'
    )
    expect(requests.length).toBe(1)
    expect(requests[0]._dd!.trace_id).toMatch(/\d+/)
    expect(requests[0]._dd!.span_id).toMatch(/\d+/)
    expect(requests[0].resource.id).toBeDefined()
  }
})
