import type { StackTrace } from '@datadog/browser-core'
import { callMonitored } from '../../tools/monitor'
import type { Configuration } from '../configuration'
import { updateExperimentalFeatures, INTAKE_SITE_US1, INTAKE_SITE_US1_FED } from '../configuration'
import { resetTelemetry, startTelemetry, scrubCustomerFrames, formatError } from './telemetry'

function startAndSpyTelemetry(configuration?: Partial<Configuration>) {
  const telemetry = startTelemetry({
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

  it('should contains feature flags', () => {
    updateExperimentalFeatures(['foo'])
    const { notifySpy } = startAndSpyTelemetry()
    callMonitored(() => {
      throw new Error('message')
    })

    expect(notifySpy.calls.mostRecent().args[0].experimental_features).toEqual(['foo'])
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
        stack: 'Not an instance of error',
      },
    })
  })

  it('formats objects', () => {
    expect(formatError({ foo: 'bar' })).toEqual({
      message: 'Uncaught {"foo":"bar"}',
      error: {
        stack: 'Not an instance of error',
      },
    })
  })
})

describe('scrubCustomerFrames', () => {
  it('should remove stack trace frames that are related to customer files', () => {
    ;[
      { scrub: false, url: 'https://www.datadoghq-browser-agent.com/datadog-rum-v4.js' },
      { scrub: false, url: 'https://www.datad0g-browser-agent.com/datadog-rum-v5.js' },
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
