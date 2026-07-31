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

  createTest('trace fetch with a 128-bit trace id')
    .withRum({
      service: 'service',
      allowedTracingUrls: ['LOCATION_ORIGIN'],
      enableExperimentalFeatures: ['trace_id_128_bit'],
    })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      const rawHeaders = await page.evaluate(() =>
        window
          .fetch('/headers')
          .then((response) => response.text())
          .catch(() => new Error('Fetch request failed!'))
      )
      const headers = parseHeaders(rawHeaders)
      const fullTraceId = check128BitRequestHeaders(headers)
      await flushEvents()
      checkTraceAssociatedToRumEvent(intakeRegistry, fullTraceId)
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

  createTest('propagate trace baggage with user and account')
    .withRum({
      service: 'service',
      allowedTracingUrls: ['LOCATION_ORIGIN'],
      enableExperimentalFeatures: ['user_account_trace_header'],
    })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        window.DD_RUM!.setUser({ id: 'p1745' })
        window.DD_RUM!.setAccount({ id: 'c9wpq8xrvd9t' })
      })
      const rawHeaders = await page.evaluate(() =>
        window
          .fetch('/headers')
          .then((response) => response.text())
          .catch(() => new Error('Fetch request failed!'))
      )
      const headers = parseHeaders(rawHeaders)
      checkRequestHeaders(headers)
      expect(headers['baggage']).toMatch(/user\.id=p1745/)
      expect(headers['baggage']).toMatch(/account\.id=c9wpq8xrvd9t/)
      await flushEvents()
      checkTraceAssociatedToRumEvent(intakeRegistry)
    })

  createTest('do not propagate trace baggage when disabled')
    .withRum({
      service: 'service',
      allowedTracingUrls: ['LOCATION_ORIGIN'],
      propagateTraceBaggage: false,
    })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      const rawHeaders = await page.evaluate(() =>
        window
          .fetch('/headers')
          .then((response) => response.text())
          .catch(() => new Error('Fetch request failed!'))
      )
      const headers = parseHeaders(rawHeaders)
      checkRequestHeaders(headers, { withBaggage: false })
      await flushEvents()
      checkTraceAssociatedToRumEvent(intakeRegistry)
    })

  createTest('trace a cross-origin request with a 128-bit trace id')
    .withRum({
      service: 'service',
      allowedTracingUrls: [(url) => url.includes('/restricted-cors-headers-with-tags')],
      enableExperimentalFeatures: ['trace_id_128_bit'],
    })
    .run(async ({ servers, intakeRegistry, sendXhr, flushEvents }) => {
      const rawHeaders = await sendXhr(`${servers.crossOrigin.origin}/restricted-cors-headers-with-tags`)
      const headers = parseHeaders(rawHeaders)
      const fullTraceId = check128BitRequestHeaders(headers)
      await flushEvents()
      checkTraceAssociatedToRumEvent(intakeRegistry, fullTraceId)
    })

  createTest('reject a cross-origin 128-bit Datadog trace when x-datadog-tags is not allowed')
    .withRum({
      service: 'service',
      allowedTracingUrls: [(url) => url.includes('/restricted-cors-headers')],
      enableExperimentalFeatures: ['trace_id_128_bit'],
    })
    .run(async ({ servers, sendXhr, withBrowserLogs }) => {
      await expect(sendXhr(`${servers.crossOrigin.origin}/restricted-cors-headers`)).rejects.toThrow()
      withBrowserLogs((logs) => {
        expect(logs.some((log) => log.level === 'error' && log.message.includes('x-datadog-tags'))).toBe(true)
      })
    })

  createTest('trace a cross-origin 64-bit request with the legacy CORS allowlist')
    .withRum({
      service: 'service',
      allowedTracingUrls: [(url) => url.includes('/restricted-cors-headers')],
    })
    .run(async ({ servers, intakeRegistry, sendXhr, flushEvents }) => {
      const rawHeaders = await sendXhr(`${servers.crossOrigin.origin}/restricted-cors-headers`)
      const headers = parseHeaders(rawHeaders)
      checkRequestHeaders(headers)
      expect(headers['x-datadog-tags']).toBeUndefined()
      await flushEvents()
      checkTraceAssociatedToRumEvent(intakeRegistry)
    })

  createTest('trace a cross-origin 128-bit tracecontext request without x-datadog-tags')
    .withRum({
      service: 'service',
      allowedTracingUrls: [
        { match: (url: string) => url.includes('/restricted-cors-headers'), propagatorTypes: ['tracecontext'] },
      ],
      enableExperimentalFeatures: ['trace_id_128_bit'],
    })
    .run(async ({ servers, intakeRegistry, sendXhr, flushEvents }) => {
      const rawHeaders = await sendXhr(`${servers.crossOrigin.origin}/restricted-cors-headers`)
      const headers = parseHeaders(rawHeaders)
      expect(headers['x-datadog-trace-id']).toBeUndefined()
      expect(headers['x-datadog-tags']).toBeUndefined()
      const fullTraceId = headers['traceparent'].split('-')[1]
      expect(fullTraceId).toMatch(/^[0-9a-f]{8}00000000[0-9a-f]{16}$/)
      await flushEvents()
      checkTraceAssociatedToRumEvent(intakeRegistry, fullTraceId)
    })

  interface ParsedHeaders {
    [key: string]: string
  }

  function parseHeaders(rawHeaders: string | Error): ParsedHeaders {
    expect(rawHeaders).not.toBeInstanceOf(Error)

    if (rawHeaders instanceof Error) {
      return {}
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return JSON.parse(rawHeaders)
  }

  // By default, we send both Datadog and W3C tracecontext headers, and baggage with session.id
  function checkRequestHeaders(
    headers: ParsedHeaders,
    { withBaggage }: { withBaggage: boolean } = { withBaggage: true }
  ) {
    expect(headers['x-datadog-trace-id']).toMatch(/\d+/)
    expect(headers['x-datadog-origin']).toBe('rum')
    expect(headers['traceparent']).toMatch(/^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-01$/)
    if (withBaggage) {
      expect(headers['baggage']).toMatch(/session\.id=\S+/)
    } else {
      expect(headers['baggage']).toBeUndefined()
    }
  }

  function check128BitRequestHeaders(headers: ParsedHeaders): string {
    const fullTraceId = headers['traceparent'].split('-')[1]
    const highTraceId = fullTraceId.slice(0, 16)
    const lowTraceId = fullTraceId.slice(16)

    expect(fullTraceId).toMatch(/^[0-9a-f]{8}00000000[0-9a-f]{16}$/)
    expect(headers['x-datadog-tags']).toBe(`_dd.p.tid=${highTraceId}`)
    expect(BigInt(headers['x-datadog-trace-id']).toString(16).padStart(16, '0')).toBe(lowTraceId)
    return fullTraceId
  }

  function checkTraceAssociatedToRumEvent(intakeRegistry: IntakeRegistry, expectedTraceId?: string) {
    const requests = intakeRegistry.rumResourceEvents.filter(
      (event) => event.resource.type === 'xhr' || event.resource.type === 'fetch'
    )
    expect(requests).toHaveLength(1)
    if (expectedTraceId) {
      expect(requests[0]._dd.trace_id).toBe(expectedTraceId)
    } else {
      expect(requests[0]._dd.trace_id).toMatch(/\d+/)
    }
    expect(requests[0]._dd.span_id).toMatch(/\d+/)
    expect(requests[0].resource.id).toBeDefined()
  }
})
