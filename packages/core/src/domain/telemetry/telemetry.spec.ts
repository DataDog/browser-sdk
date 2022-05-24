import type { StackTrace } from '@datadog/browser-core'
import type { Context } from '../../tools/context'
import { display } from '../../tools/display'
import type { Configuration } from '../configuration'
import { INTAKE_SITE_US1, INTAKE_SITE_US1_FED } from '../configuration'
import type { Telemetry } from './telemetry'
import {
  monitor,
  monitored,
  resetTelemetry,
  startTelemetry,
  callMonitored,
  setDebugMode,
  scrubCustomerFrames,
} from './telemetry'
import type { TelemetryEvent, TelemetryErrorEvent } from './telemetryEvent.types'

const configuration: Partial<Configuration> = {
  maxTelemetryEventsPerPage: 7,
  telemetrySampleRate: 100,
}

describe('telemetry', () => {
  afterEach(() => {
    resetTelemetry()
  })

  describe('decorator', () => {
    class Candidate {
      @monitored
      monitoredThrowing() {
        throw new Error('monitored')
      }

      @monitored
      monitoredStringErrorThrowing() {
        // eslint-disable-next-line no-throw-literal
        throw 'string error'
      }

      @monitored
      monitoredObjectErrorThrowing() {
        // eslint-disable-next-line no-throw-literal
        throw { foo: 'bar' }
      }

      @monitored
      monitoredNotThrowing() {
        return 1
      }

      notMonitoredThrowing() {
        throw new Error('not monitored')
      }
    }

    let candidate: Candidate
    beforeEach(() => {
      candidate = new Candidate()
    })

    describe('before initialization', () => {
      it('should not monitor', () => {
        expect(() => candidate.notMonitoredThrowing()).toThrowError('not monitored')
        expect(() => candidate.monitoredThrowing()).toThrowError('monitored')
        expect(candidate.monitoredNotThrowing()).toEqual(1)
      })
    })

    describe('after initialization', () => {
      let notifySpy: jasmine.Spy<(event: TelemetryEvent) => void>

      beforeEach(() => {
        const { observable } = startTelemetry(configuration as Configuration)
        notifySpy = jasmine.createSpy('notified')
        observable.subscribe(notifySpy)
      })

      it('should preserve original behavior', () => {
        expect(candidate.monitoredNotThrowing()).toEqual(1)
      })

      it('should catch error', () => {
        expect(() => candidate.notMonitoredThrowing()).toThrowError()
        expect(() => candidate.monitoredThrowing()).not.toThrowError()
      })

      it('should report error', () => {
        candidate.monitoredThrowing()

        const event = notifySpy.calls.mostRecent().args[0] as TelemetryErrorEvent
        expect(event.telemetry.message).toEqual('monitored')
        expect(event.telemetry.error!.stack).toMatch('monitored')
      })

      it('should report string error', () => {
        candidate.monitoredStringErrorThrowing()

        const event = notifySpy.calls.mostRecent().args[0] as TelemetryErrorEvent
        expect(event.telemetry.message).toEqual('Uncaught "string error"')
        expect(event.telemetry.error!.stack).toMatch('Not an instance of error')
      })

      it('should report object error', () => {
        candidate.monitoredObjectErrorThrowing()

        const event = notifySpy.calls.mostRecent().args[0] as TelemetryErrorEvent
        expect(event.telemetry.message).toEqual('Uncaught {"foo":"bar"}')
        expect(event.telemetry.error!.stack).toMatch('Not an instance of error')
      })
    })
  })

  describe('function', () => {
    const notThrowing = () => 1
    const throwing = () => {
      throw new Error('error')
    }
    let notifySpy: jasmine.Spy<(event: TelemetryEvent) => void>

    beforeEach(() => {
      const { observable } = startTelemetry(configuration as Configuration)
      notifySpy = jasmine.createSpy('notified')
      observable.subscribe(notifySpy)
    })

    describe('direct call', () => {
      it('should preserve original behavior', () => {
        expect(callMonitored(notThrowing)).toEqual(1)
      })

      it('should catch error', () => {
        expect(() => callMonitored(throwing)).not.toThrowError()
      })

      it('should report error', () => {
        callMonitored(throwing)

        expect(notifySpy.calls.mostRecent().args[0].telemetry.message).toEqual('error')
      })
    })

    describe('wrapper', () => {
      it('should preserve original behavior', () => {
        const decorated = monitor(notThrowing)
        expect(decorated()).toEqual(1)
      })

      it('should catch error', () => {
        const decorated = monitor(throwing)
        expect(() => decorated()).not.toThrowError()
      })

      it('should report error', () => {
        monitor(throwing)()

        expect(notifySpy.calls.mostRecent().args[0].telemetry.message).toEqual('error')
      })
    })
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

  describe('setDebug', () => {
    let displaySpy: jasmine.Spy

    beforeEach(() => {
      displaySpy = spyOn(display, 'error')
      startTelemetry(configuration as Configuration)
    })

    it('when not called, should not display error', () => {
      callMonitored(() => {
        throw new Error('message')
      })

      expect(displaySpy).not.toHaveBeenCalled()
    })

    it('when called, should display error', () => {
      setDebugMode(true)

      callMonitored(() => {
        throw new Error('message')
      })

      expect(displaySpy).toHaveBeenCalled()
    })

    it('when called and telemetry not sampled, should display error', () => {
      startTelemetry({ ...configuration, telemetrySampleRate: 0 } as Configuration)
      setDebugMode(true)

      callMonitored(() => {
        throw new Error('message')
      })

      expect(displaySpy).toHaveBeenCalled()
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
