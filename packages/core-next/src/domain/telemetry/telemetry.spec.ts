import { Telemetry } from './telemetry'
import type { TelemetryEvent } from './telemetry'

const EXCLUDED_SITE = 'us1.ddog-gov.com'

function createTelemetry(overrides: Partial<ConstructorParameters<typeof Telemetry>[0]> = {}) {
  const events: TelemetryEvent[] = []
  const telemetry = new Telemetry(
    {
      site: 'datadoghq.com',
      telemetrySampleRate: 100,
      telemetryConfigurationSampleRate: 100,
      telemetryUsageSampleRate: 100,
      ...overrides,
    },
    (event) => events.push(event)
  )
  return { telemetry, events }
}

describe('Telemetry - basic reporting', () => {
  it('should report a debug event', () => {
    const { telemetry, events } = createTelemetry()

    telemetry.debug('internal message')

    expect(events.length).toBe(1)
    expect(events[0].type).toBe('log')
    expect(events[0].status).toBe('debug')
    expect(events[0].message).toBe('internal message')
  })

  it('should report an error event', () => {
    const { telemetry, events } = createTelemetry()

    telemetry.error('something broke', new Error('boom'))

    expect(events.length).toBe(1)
    expect(events[0].type).toBe('log')
    expect(events[0].status).toBe('error')
    expect(events[0].message).toBe('something broke')
  })

  it('should report a usage event', () => {
    const { telemetry, events } = createTelemetry()

    telemetry.usage('startView')

    expect(events.length).toBe(1)
    expect(events[0].type).toBe('usage')
    expect(events[0].feature).toBe('startView')
  })

  it('should report a configuration event', () => {
    const { telemetry, events } = createTelemetry()

    telemetry.configuration({ sessionSampleRate: 100 })

    expect(events.length).toBe(1)
    expect(events[0].type).toBe('configuration')
  })
})

describe('Telemetry - rate limiting', () => {
  it('should drop events beyond 15 per kind', () => {
    const { telemetry, events } = createTelemetry()

    for (let i = 0; i < 20; i++) {
      telemetry.debug(`message ${i}`)
    }

    expect(events.length).toBe(15)
  })

  it('should track limits independently per kind', () => {
    const { telemetry, events } = createTelemetry()

    for (let i = 0; i < 20; i++) {
      telemetry.debug(`message ${i}`)
      telemetry.usage(`feature${i}`)
    }

    expect(events.filter((e) => e.type === 'log').length).toBe(15)
    expect(events.filter((e) => e.type === 'usage').length).toBe(15)
  })
})

describe('Telemetry - deduplication', () => {
  it('should drop duplicate events with identical content', () => {
    const { telemetry, events } = createTelemetry()

    telemetry.debug('same message')
    telemetry.debug('same message')

    expect(events.length).toBe(1)
  })

  it('should allow different messages of the same type', () => {
    const { telemetry, events } = createTelemetry()

    telemetry.debug('message a')
    telemetry.debug('message b')

    expect(events.length).toBe(2)
  })
})

describe('Telemetry - sample rates', () => {
  it('should not send any events when telemetrySampleRate is 0', () => {
    const { telemetry, events } = createTelemetry({ telemetrySampleRate: 0 })

    telemetry.debug('message')
    telemetry.error('error')

    expect(events.length).toBe(0)
  })

  it('should not send usage events when telemetryUsageSampleRate is 0', () => {
    const { telemetry, events } = createTelemetry({ telemetryUsageSampleRate: 0 })

    telemetry.usage('startView')

    expect(events.length).toBe(0)
  })

  it('should not send configuration events when telemetryConfigurationSampleRate is 0', () => {
    const { telemetry, events } = createTelemetry({ telemetryConfigurationSampleRate: 0 })

    telemetry.configuration({ sessionSampleRate: 100 })

    expect(events.length).toBe(0)
  })
})

describe('Telemetry - excluded sites', () => {
  it('should not send any events on excluded sites', () => {
    const { telemetry, events } = createTelemetry({ site: EXCLUDED_SITE })

    telemetry.debug('message')
    telemetry.error('error')
    telemetry.usage('startView')
    telemetry.configuration({})

    expect(events.length).toBe(0)
  })
})

describe('Telemetry - stack trace scrubbing', () => {
  it('should include stack trace in error events', () => {
    const { telemetry, events } = createTelemetry()

    telemetry.error('boom', new Error('original error'))

    expect((events[0] as any).stack).toBeDefined()
  })

  it('should scrub customer frames from the stack trace', () => {
    const { telemetry, events } = createTelemetry()
    const error = new Error('boom')
    error.stack = [
      'Error: boom',
      '  at customerCode (https://customer-app.com/app.js:10:5)',
      '  at sdkCode (https://www.datadoghq-browser-agent.com/datadog-rum.js:100:10)',
    ].join('\n')

    telemetry.error('boom', error)

    const stack = (events[0] as any).stack as string
    expect(stack).not.toContain('customer-app.com')
    expect(stack).toContain('datadoghq-browser-agent.com')
  })

  it('should handle errors without a stack trace', () => {
    const { telemetry, events } = createTelemetry()
    const error = new Error('no stack')
    error.stack = undefined

    telemetry.error('boom', error)

    expect(events.length).toBe(1)
  })
})

describe('Telemetry - context providers', () => {
  it('should merge context from registered providers into events', () => {
    const { telemetry, events } = createTelemetry()

    telemetry.registerContext(() => ({ sessionId: 'abc123' }))
    telemetry.debug('message')

    expect((events[0] as any).sessionId).toBe('abc123')
  })

  it('should merge context from multiple providers', () => {
    const { telemetry, events } = createTelemetry()

    telemetry.registerContext(() => ({ sessionId: 'abc' }))
    telemetry.registerContext(() => ({ viewId: 'view1' }))
    telemetry.debug('message')

    expect((events[0] as any).sessionId).toBe('abc')
    expect((events[0] as any).viewId).toBe('view1')
  })
})
