import type { StackTrace } from '@datadog/browser-core'
import type { Context } from '../../tools/context'
import { callMonitored } from '../../tools/monitor'
import type { Configuration } from '../configuration'
import { INTAKE_SITE_US1, INTAKE_SITE_US1_FED } from '../configuration'
import type { Telemetry } from './telemetry'
import { resetTelemetry, startTelemetry, scrubCustomerFrames } from './telemetry'
import type { TelemetryEvent } from './telemetryEvent.types'

const configuration: Partial<Configuration> = {
  maxTelemetryEventsPerPage: 7,
  telemetrySampleRate: 100,
}

describe('telemetry', () => {
  afterEach(() => {
    resetTelemetry()
  })

  describe('telemetry context', () => {
    let telemetry: Telemetry
    let notifySpy: jasmine.Spy<(event: TelemetryEvent) => void>

    beforeEach(() => {
      telemetry = startTelemetry(configuration as Configuration)
      notifySpy = jasmine.createSpy('notified')
      telemetry.observable.subscribe(notifySpy)
    })

    it('should be added to telemetry events', () => {
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
    let telemetry: Telemetry
    let notifySpy: jasmine.Spy<(event: TelemetryEvent & Context) => void>

    beforeEach(() => {
      telemetry = startTelemetry(configuration as Configuration)
      notifySpy = jasmine.createSpy('notified')
      telemetry.observable.subscribe(notifySpy)
    })

    it('should notify when sampled', () => {
      spyOn(Math, 'random').and.callFake(() => 0)
      telemetry = startTelemetry({ ...configuration, telemetrySampleRate: 50 } as Configuration)
      telemetry.observable.subscribe(notifySpy)

      callMonitored(() => {
        throw new Error('message')
      })

      expect(notifySpy).toHaveBeenCalled()
    })

    it('should not notify when not sampled', () => {
      spyOn(Math, 'random').and.callFake(() => 1)
      telemetry = startTelemetry({ ...configuration, telemetrySampleRate: 50 } as Configuration)
      telemetry.observable.subscribe(notifySpy)

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
        const telemetry = startTelemetry({ ...configuration, site } as Configuration)
        const notifySpy = jasmine.createSpy('notified')
        telemetry.observable.subscribe(notifySpy)

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
