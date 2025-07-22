import type { TelemetryEvent } from '../../../../../../packages/core/src/domain/telemetry'
import type { LogsEvent } from '../../../../../../packages/logs/src/logsEvent.types'
import type { RumEvent } from '../../../../../../packages/rum-core/src/rumEvent.types'
import { getIntakeUrlForEvent, escapeShellParameter } from './copyEvent'

const RUM_ERROR_EVENT = { type: 'error' } as RumEvent
const TELEMETRY_EVENT = {
  type: 'telemetry',
  telemetry: { type: 'log' },
} as TelemetryEvent
const LOG_EVENT = {
  status: 'info',
} as LogsEvent

describe('getIntakeUrlForEvent', () => {
  it('should return undefined when RUM is not present', () => {
    expect(getIntakeUrlForEvent({} as any, RUM_ERROR_EVENT)).toBeUndefined()
  })

  it('should return undefined when no RUM config', () => {
    expect(getIntakeUrlForEvent({ rum: {} } as any, RUM_ERROR_EVENT)).toBeUndefined()
  })

  it('should return undefined when no RUM version', () => {
    expect(getIntakeUrlForEvent({ rum: { config: {} } } as any, RUM_ERROR_EVENT)).toBeUndefined()
  })

  it('should return the URL with the right parameters', () => {
    const url = new URL(
      getIntakeUrlForEvent(
        {
          rum: {
            config: {
              clientToken: 'client-token',
            },
            version: '1.2.3',
          },
        } as any,
        RUM_ERROR_EVENT
      )!
    )

    expect(url.host).toBe('browser-intake-datadoghq.com')
    expect(url.pathname).toBe('/api/v2/rum')
    expect(url.searchParams.get('ddsource')).toBe('browser')
    expect(url.searchParams.get('dd-api-key')).toBe('client-token')
    expect(url.searchParams.get('dd-evp-origin-version')).toBe('1.2.3')
    expect(url.searchParams.get('dd-evp-origin')).toBe('browser')
    expect(url.searchParams.get('dd-request-id')).toMatch(/[a-f0-9-]+/)
    expect(url.searchParams.get('batch_time')).toMatch(/[0-9]+/)
  })

  it('should escape the version URL parameter', () => {
    const url = new URL(
      getIntakeUrlForEvent(
        {
          rum: {
            config: {
              clientToken: 'client-token',
            },
            version: '1.2.3&4',
          },
        } as any,
        RUM_ERROR_EVENT
      )!
    )

    expect(url.searchParams.get('dd-evp-origin-version')).toBe('1.2.3&4')
  })

  it('should use the RUM intake for telemetry events', () => {
    const url = new URL(
      getIntakeUrlForEvent(
        {
          rum: {
            config: {
              clientToken: 'client-token',
            },
            version: '1.2.3',
          },
        } as any,
        TELEMETRY_EVENT
      )!
    )

    expect(url.pathname).toBe('/api/v2/rum')
  })

  it('should use the Logs intake for Log events', () => {
    const url = new URL(
      getIntakeUrlForEvent(
        {
          logs: {
            config: {
              clientToken: 'client-token',
            },
            version: '1.2.3',
          },
        } as any,
        LOG_EVENT
      )!
    )

    expect(url.pathname).toBe('/api/v2/logs')
  })
})

describe('escapeShellParameter', () => {
  it('should escape simple strings', () => {
    expect(escapeShellParameter('foo bar')).toBe("$'foo bar'")
  })

  it('should escape backslashes', () => {
    expect(escapeShellParameter('foo\\bar')).toBe("$'foo\\\\bar'")
  })

  it('should escape single quotes', () => {
    expect(escapeShellParameter("foo'bar")).toBe("$'foo\\'bar'")
  })
})
