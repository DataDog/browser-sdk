import type { StackTrace } from '@datadog/browser-core'
import { NO_ERROR_STACK_PRESENT_MESSAGE } from '../error/error'
import { callMonitored } from '../../tools/monitor'
import type { ExperimentalFeature } from '../../tools/experimentalFeatures'
import { resetExperimentalFeatures, addExperimentalFeatures } from '../../tools/experimentalFeatures'
import type { Configuration } from '../configuration'
import { INTAKE_SITE_US1, INTAKE_SITE_US1_FED } from '../configuration'
import { setNavigatorOnLine, setNavigatorConnection } from '../../../test'
import {
  resetTelemetry,
  startTelemetry,
  scrubCustomerFrames,
  formatError,
  addTelemetryConfiguration,
  TelemetryService,
} from './telemetry'

function startAndSpyTelemetry(configuration?: Partial<Configuration>) {
  const telemetry = startTelemetry(TelemetryService.RUM, {
    maxTelemetryEventsPerPage: 7,
    telemetrySampleRate: 100,
    ...configuration,
  } as Configuration)
  const notifySpy = jasmine.createSpy('notified')
  telemetry.observable.subscribe(notifySpy)
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

  describe('telemetry context', () => {
    it('should be added to telemetry events', () => {
      const { telemetry, notifySpy } = startAndSpyTelemetry()

      telemetry.setContextProvider(() => ({
        foo: 'bar',
      }))
      callMonitored(() => {
        throw new Error('message')
      })
      expect(notifySpy.calls.mostRecent().args[0].foo).toEqual('bar')

      telemetry.setContextProvider(() => ({}))
      callMonitored(() => {
        throw new Error('message')
      })
      expect(notifySpy.calls.mostRecent().args[0].foo).not.toBeDefined()
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
