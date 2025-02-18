import { test, expect } from '@playwright/test'
import type { IntakeRegistry } from '../../lib/framework'
import { createTest } from '../../lib/framework'

test.describe('tracing', () => {
  createTest('trace xhr')
    .withRum({ service: 'service', allowedTracingUrls: ['LOCATION_ORIGIN'] })
    .run(async ({ intakeRegistry, sendXhr, flushEvents }) => {
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
    .withRum({ service: 'service', allowedTracingUrls: ['LOCATION_ORIGIN'] })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      const rawHeaders = await page.evaluate(() =>
        window
          .fetch('/headers', {
            headers: [
              ['x-foo', 'bar'],
              ['x-foo', 'baz'],
            ],
          })
          .then((response) => response.text())
          .catch(() => new Error('Fetch request failed!'))
      )
      const headers = parseHeaders(rawHeaders)
      checkRequestHeaders(headers)
      expect(headers['x-foo']).toBe('bar, baz')
      await flushEvents()
      checkTraceAssociatedToRumEvent(intakeRegistry)
    })

  createTest('trace fetch with Request argument')
    .withRum({ service: 'service', allowedTracingUrls: ['LOCATION_ORIGIN'] })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      const rawHeaders = await page.evaluate(() =>
        window
          .fetch(new Request('/headers', { headers: { 'x-foo': 'bar, baz' } }))
          .then((response) => response.text())
          .catch(() => new Error('Fetch request failed!'))
      )
      const headers = parseHeaders(rawHeaders)
      checkRequestHeaders(headers)
      expect(headers['x-foo']).toBe('bar, baz')
      await flushEvents()
      checkTraceAssociatedToRumEvent(intakeRegistry)
    })

  createTest('trace single argument fetch')
    .withRum({ service: 'service', allowedTracingUrls: ['LOCATION_ORIGIN'] })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      const rawHeaders = await page.evaluate(() =>
        window
          .fetch('/headers')
          .then((response) => response.text())
          .catch(() => new Error('Fetch request failed!'))
      )
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
    expect(requests).toHaveLength(1)
    expect(requests[0]._dd.trace_id).toMatch(/\d+/)
    expect(requests[0]._dd.span_id).toMatch(/\d+/)
    expect(requests[0].resource.id).toBeDefined()
  }
})
