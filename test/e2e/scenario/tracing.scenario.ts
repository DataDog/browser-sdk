import { createTest } from '../lib/createTest'
import { EventRegistry } from '../lib/eventsRegistry'
import { flushEvents, sendFetch, sendXhr } from '../lib/helpers'
import { allSetups } from '../lib/setups'

describe('tracing', () => {
  createTest(
    'trace xhr',
    allSetups({ rum: { service: 'Service', allowedTracingOrigins: ['LOCATION_ORIGIN'] } }),
    async ({ events }) => {
      const rawHeaders = await sendXhr(`/headers`, [['x-foo', 'bar'], ['x-foo', 'baz']])
      checkRequestHeaders(rawHeaders)
      await flushEvents()
      await checkTraceAssociatedToRumEvent(events)
    }
  )

  createTest(
    'trace fetch',
    allSetups({ rum: { service: 'Service', allowedTracingOrigins: ['LOCATION_ORIGIN'] } }),
    async ({ events }) => {
      const rawHeaders = await sendFetch(`/headers`, [['x-foo', 'bar'], ['x-foo', 'baz']])
      checkRequestHeaders(rawHeaders)
      await flushEvents()
      await checkTraceAssociatedToRumEvent(events)
    }
  )

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
