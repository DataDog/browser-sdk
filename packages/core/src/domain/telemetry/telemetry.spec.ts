import { NO_ERROR_STACK_PRESENT_MESSAGE } from '../error/error'
import { callMonitored } from '../../tools/monitor'
import type { ExperimentalFeature } from '../../tools/experimentalFeatures'
import { resetExperimentalFeatures, addExperimentalFeatures } from '../../tools/experimentalFeatures'
import type { Configuration } from '../configuration'
import { INTAKE_SITE_US1_FED, INTAKE_SITE_US1 } from '../intakeSites'
import { setNavigatorOnLine, setNavigatorConnection } from '../../../test'
import type { Context } from '../../tools/serialisation/context'
import { Observable } from '../../tools/observable'
import type { StackTrace } from '../../tools/stackTrace/computeStackTrace'
import {
  addTelemetryError,
  resetTelemetry,
  scrubCustomerFrames,
  formatError,
  addTelemetryConfiguration,
  addTelemetryUsage,
  TelemetryService,
  startTelemetryCollection,
} from './telemetry'
import type { TelemetryEvent } from './telemetryEvent.types'

function startAndSpyTelemetry(configuration?: Partial<Configuration>) {
  const observable = new Observable<TelemetryEvent & Context>()

  const notifySpy = jasmine.createSpy('notified')
  observable.subscribe(notifySpy)

  const telemetry = startTelemetryCollection(
    TelemetryService.RUM,
    {
      maxTelemetryEventsPerPage: 7,
      telemetrySampleRate: 100,
      telemetryUsageSampleRate: 100,
      ...configuration,
    } as Configuration,
    observable
  )

  return {
    notifySpy,
    telemetry,
  }
}

describe('telemetry', () => {
  afterEach(() => {
    resetTelemetry()
  })

  it('collects "monitor" errors', () => {
    const { notifySpy } = startAndSpyTelemetry()
    callMonitored(() => {
      throw new Error('message')
    })
    expect(notifySpy).toHaveBeenCalledTimes(1)
  })

  describe('addTelemetryConfiguration', () => {
    afterEach(() => {
      resetExperimentalFeatures()
    })

    it('should collects configuration when sampled', () => {
      const { notifySpy } = startAndSpyTelemetry({ telemetrySampleRate: 100, telemetryConfigurationSampleRate: 100 })

      addTelemetryConfiguration({})

      expect(notifySpy).toHaveBeenCalled()
    })

    it('should not notify configuration when not sampled', () => {
      const { notifySpy } = startAndSpyTelemetry({ telemetrySampleRate: 100, telemetryConfigurationSampleRate: 0 })

      addTelemetryConfiguration({})

      expect(notifySpy).not.toHaveBeenCalled()
    })

    it('should not notify configuration when telemetrySampleRate is 0', () => {
      const { notifySpy } = startAndSpyTelemetry({ telemetrySampleRate: 0, telemetryConfigurationSampleRate: 100 })

      addTelemetryConfiguration({})

      expect(notifySpy).not.toHaveBeenCalled()
    })
  })

  describe('addTelemetryUsage', () => {
    it('should collects usage when sampled', () => {
      const { notifySpy } = startAndSpyTelemetry({ telemetrySampleRate: 100, telemetryUsageSampleRate: 100 })

      addTelemetryUsage({ feature: 'set-tracking-consent', tracking_consent: 'granted' })

      expect(notifySpy).toHaveBeenCalled()
    })

    it('should not notify usage when not sampled', () => {
      const { notifySpy } = startAndSpyTelemetry({ telemetrySampleRate: 100, telemetryUsageSampleRate: 0 })

      addTelemetryUsage({ feature: 'set-tracking-consent', tracking_consent: 'granted' })

      expect(notifySpy).not.toHaveBeenCalled()
    })

    it('should not notify usage when telemetrySampleRate is 0', () => {
      const { notifySpy } = startAndSpyTelemetry({ telemetrySampleRate: 0, telemetryUsageSampleRate: 100 })

      addTelemetryUsage({ feature: 'set-tracking-consent', tracking_consent: 'granted' })

      expect(notifySpy).not.toHaveBeenCalled()
    })
  })

  it('should contains feature flags', () => {
    addExperimentalFeatures(['foo' as ExperimentalFeature])
    const { notifySpy } = startAndSpyTelemetry()
    callMonitored(() => {
      throw new Error('message')
    })

    expect(notifySpy.calls.mostRecent().args[0].experimental_features).toEqual(['foo'])
  })

  it('should contains runtime env', () => {
    const { notifySpy } = startAndSpyTelemetry()
    callMonitored(() => {
      throw new Error('message')
    })

    expect(notifySpy.calls.mostRecent().args[0].telemetry.runtime_env).toEqual({
      is_local_file: jasmine.any(Boolean),
      is_worker: jasmine.any(Boolean),
    })
  })

  it('should contain connectivity information', () => {
    setNavigatorOnLine(false)
    setNavigatorConnection({ type: 'wifi', effectiveType: '4g' })

    const { notifySpy } = startAndSpyTelemetry()
    callMonitored(() => {
      throw new Error('message')
    })

    expect(notifySpy.calls.mostRecent().args[0].telemetry.connectivity).toEqual({
      status: 'not_connected',
      interfaces: ['wifi'],
      effective_type: '4g',
    })
  })

  it('should collect pre start events', () => {
    addTelemetryUsage({ feature: 'set-tracking-consent', tracking_consent: 'granted' })

    const { notifySpy } = startAndSpyTelemetry({ telemetrySampleRate: 100, telemetryUsageSampleRate: 100 })

    expect(notifySpy).toHaveBeenCalled()
  })

  describe('telemetry context', () => {
    it('should be added to telemetry events', () => {
      const { telemetry, notifySpy } = startAndSpyTelemetry()

      telemetry.setContextProvider('foo', () => 'bar')

      callMonitored(() => {
        throw new Error('foo')
      })
      expect(notifySpy.calls.mostRecent().args[0].foo).toEqual('bar')

      telemetry.setContextProvider('foo', () => undefined)
      callMonitored(() => {
        throw new Error('bar')
      })
      expect(notifySpy.calls.mostRecent().args[0].foo).not.toBeDefined()
    })

    it('allows adding context progressively', () => {
      const { telemetry, notifySpy } = startAndSpyTelemetry()
      telemetry.setContextProvider('application.id', () => 'bar')
      callMonitored(() => {
        throw new Error('foo')
      })
      telemetry.setContextProvider('session.id', () => '123')
      callMonitored(() => {
        throw new Error('bar')
      })

      expect(notifySpy.calls.argsFor(0)[0]['application.id']).toEqual('bar')
      expect(notifySpy.calls.argsFor(1)[0]).toEqual(
        jasmine.objectContaining({
          'application.id': 'bar',
          'session.id': '123',
        })
      )
    })
  })

  describe('sampling', () => {
    it('should notify when sampled', () => {
      spyOn(Math, 'random').and.callFake(() => 0)
      const { notifySpy } = startAndSpyTelemetry({ telemetrySampleRate: 50 })

      callMonitored(() => {
        throw new Error('message')
      })

      expect(notifySpy).toHaveBeenCalled()
    })

    it('should not notify when not sampled', () => {
      spyOn(Math, 'random').and.callFake(() => 1)
      const { notifySpy } = startAndSpyTelemetry({ telemetrySampleRate: 50 })

      callMonitored(() => {
        throw new Error('message')
      })

      expect(notifySpy).not.toHaveBeenCalled()
    })
  })

  describe('deduplicating', () => {
    it('should discard already sent telemetry', () => {
      const { notifySpy } = startAndSpyTelemetry()
      const fooError = new Error('foo')
      const barError = new Error('bar')

      addTelemetryError(fooError)
      addTelemetryError(fooError)
      addTelemetryError(barError)

      expect(notifySpy).toHaveBeenCalledTimes(2)
      expect(notifySpy.calls.argsFor(0)[0].telemetry.message).toEqual('foo')
      expect(notifySpy.calls.argsFor(1)[0].telemetry.message).toEqual('bar')
    })

    it('should not consider a discarded event for the maxTelemetryEventsPerPage', () => {
      const { notifySpy } = startAndSpyTelemetry({ maxTelemetryEventsPerPage: 2 })

      addTelemetryUsage({ feature: 'stop-session' })
      addTelemetryUsage({ feature: 'stop-session' })
      addTelemetryUsage({ feature: 'start-session-replay-recording' })

      expect(notifySpy).toHaveBeenCalledTimes(2)
      expect(notifySpy.calls.argsFor(0)[0].telemetry.usage.feature).toEqual('stop-session')
      expect(notifySpy.calls.argsFor(1)[0].telemetry.usage.feature).toEqual('start-session-replay-recording')
    })
  })

  describe('excluded sites', () => {
    ;[
      { site: INTAKE_SITE_US1_FED, enabled: false },
      { site: INTAKE_SITE_US1, enabled: true },
    ].forEach(({ site, enabled }) => {
      it(`should be ${enabled ? 'enabled' : 'disabled'} on ${site}`, () => {
        const { notifySpy } = startAndSpyTelemetry({ site })

        callMonitored(() => {
          throw new Error('message')
        })

        if (enabled) {
          expect(notifySpy).toHaveBeenCalled()
        } else {
          expect(notifySpy).not.toHaveBeenCalled()
        }
      })
    })
  })
})

describe('formatError', () => {
  it('formats error instances', () => {
    expect(formatError(new Error('message'))).toEqual({
      message: 'message',
      error: {
        kind: 'Error',
        stack: jasmine.stringMatching(/^Error: message(\n|$)/) as unknown as string,
      },
    })
  })

  it('formats strings', () => {
    expect(formatError('message')).toEqual({
      message: 'Uncaught "message"',
      error: {
        stack: NO_ERROR_STACK_PRESENT_MESSAGE,
      },
    })
  })

  it('formats objects', () => {
    expect(formatError({ foo: 'bar' })).toEqual({
      message: 'Uncaught {"foo":"bar"}',
      error: {
        stack: NO_ERROR_STACK_PRESENT_MESSAGE,
      },
    })
  })
})

describe('scrubCustomerFrames', () => {
  it('should remove stack trace frames that are related to customer files', () => {
    ;[
      { scrub: false, url: 'https://www.datadoghq-browser-agent.com/datadog-rum-v4.js' },
      { scrub: false, url: 'https://www.datad0g-browser-agent.com/datadog-rum-v5.js' },
      { scrub: false, url: 'https://d3uc069fcn7uxw.cloudfront.net/datadog-logs-staging.js' },
      { scrub: false, url: 'https://d20xtzwzcl0ceb.cloudfront.net/datadog-rum-canary.js' },
      { scrub: false, url: 'http://localhost/index.html' },
      { scrub: false, url: undefined },
      { scrub: false, url: '<anonymous>' },
      { scrub: true, url: 'https://foo.bar/path?qux=qix' },
    ].forEach(({ url, scrub }) => {
      const candidate: Partial<StackTrace> = {
        stack: [{ url }],
      }
      expect(scrubCustomerFrames(candidate as StackTrace).stack.length).toBe(scrub ? 0 : 1, `for url: ${url!}`)
    })
  })
})
