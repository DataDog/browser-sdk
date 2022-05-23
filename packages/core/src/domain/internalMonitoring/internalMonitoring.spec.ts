import type { StackTrace } from '@datadog/browser-core'
import type { Context } from '../../tools/context'
import { display } from '../../tools/display'
import type { Configuration } from '../configuration'
import {
  updateExperimentalFeatures,
  resetExperimentalFeatures,
  INTAKE_SITE_EU,
  INTAKE_SITE_US5,
  INTAKE_SITE_US3,
  INTAKE_SITE_US,
} from '../configuration'
import type { InternalMonitoring } from './internalMonitoring'
import {
  monitor,
  monitored,
  resetInternalMonitoring,
  startInternalMonitoring,
  callMonitored,
  setDebugMode,
  scrubCustomerFrames,
} from './internalMonitoring'
import type { TelemetryEvent, TelemetryErrorEvent } from './telemetryEvent.types'

const configuration: Partial<Configuration> = {
  maxInternalMonitoringMessagesPerPage: 7,
  telemetrySampleRate: 100,
}

describe('internal monitoring', () => {
  afterEach(() => {
    resetInternalMonitoring()
    resetExperimentalFeatures()
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
        updateExperimentalFeatures(['telemetry'])
        const { telemetryEventObservable } = startInternalMonitoring(configuration as Configuration)
        notifySpy = jasmine.createSpy('notified')
        telemetryEventObservable.subscribe(notifySpy)
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

        const message = notifySpy.calls.mostRecent().args[0] as TelemetryErrorEvent
        expect(message.telemetry.message).toEqual('monitored')
        expect(message.telemetry.error!.stack).toMatch('monitored')
      })

      it('should report string error', () => {
        candidate.monitoredStringErrorThrowing()

        const message = notifySpy.calls.mostRecent().args[0] as TelemetryErrorEvent
        expect(message.telemetry.message).toEqual('Uncaught "string error"')
        expect(message.telemetry.error!.stack).toMatch('Not an instance of error')
      })

      it('should report object error', () => {
        candidate.monitoredObjectErrorThrowing()

        const message = notifySpy.calls.mostRecent().args[0] as TelemetryErrorEvent
        expect(message.telemetry.message).toEqual('Uncaught {"foo":"bar"}')
        expect(message.telemetry.error!.stack).toMatch('Not an instance of error')
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
      updateExperimentalFeatures(['telemetry'])
      const { telemetryEventObservable } = startInternalMonitoring(configuration as Configuration)
      notifySpy = jasmine.createSpy('notified')
      telemetryEventObservable.subscribe(notifySpy)
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
    let internalMonitoring: InternalMonitoring
    let notifySpy: jasmine.Spy<(event: TelemetryEvent) => void>

    beforeEach(() => {
      updateExperimentalFeatures(['telemetry'])
      internalMonitoring = startInternalMonitoring(configuration as Configuration)
      notifySpy = jasmine.createSpy('notified')
      internalMonitoring.telemetryEventObservable.subscribe(notifySpy)
    })

    it('should be added to error messages', () => {
      internalMonitoring.setTelemetryContextProvider(() => ({
        foo: 'bar',
      }))
      callMonitored(() => {
        throw new Error('message')
      })
      expect(notifySpy.calls.mostRecent().args[0].foo).toEqual('bar')

      internalMonitoring.setTelemetryContextProvider(() => ({}))
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
      updateExperimentalFeatures(['telemetry'])
      startInternalMonitoring(configuration as Configuration)
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
      updateExperimentalFeatures(['telemetry'])
      startInternalMonitoring({ ...configuration, telemetrySampleRate: 0 } as Configuration)
      setDebugMode(true)

      callMonitored(() => {
        throw new Error('message')
      })

      expect(displaySpy).toHaveBeenCalled()
    })
  })

  describe('sampling', () => {
    let internalMonitoring: InternalMonitoring
    let notifySpy: jasmine.Spy<(event: TelemetryEvent & Context) => void>

    beforeEach(() => {
      updateExperimentalFeatures(['telemetry'])
      internalMonitoring = startInternalMonitoring(configuration as Configuration)
      notifySpy = jasmine.createSpy('notified')
      internalMonitoring.telemetryEventObservable.subscribe(notifySpy)
    })

    it('should notify when sampled', () => {
      spyOn(Math, 'random').and.callFake(() => 0)
      internalMonitoring = startInternalMonitoring({ ...configuration, telemetrySampleRate: 50 } as Configuration)
      internalMonitoring.telemetryEventObservable.subscribe(notifySpy)

      callMonitored(() => {
        throw new Error('message')
      })

      expect(notifySpy).toHaveBeenCalled()
    })

    it('should not notify when not sampled', () => {
      spyOn(Math, 'random').and.callFake(() => 1)
      internalMonitoring = startInternalMonitoring({ ...configuration, telemetrySampleRate: 50 } as Configuration)
      internalMonitoring.telemetryEventObservable.subscribe(notifySpy)

      callMonitored(() => {
        throw new Error('message')
      })

      expect(notifySpy).not.toHaveBeenCalled()
    })
  })

  describe('rollout', () => {
    ;[
      { site: INTAKE_SITE_US5, enabled: true },
      { site: INTAKE_SITE_US3, enabled: true },
      { site: INTAKE_SITE_EU, enabled: true },
      { site: INTAKE_SITE_US, enabled: true },
    ].forEach(({ site, enabled }) => {
      it(`should be ${enabled ? 'enabled' : 'disabled'} on ${site}`, () => {
        updateExperimentalFeatures(['telemetry'])
        const internalMonitoring = startInternalMonitoring({ ...configuration, site } as Configuration)
        const notifySpy = jasmine.createSpy('notified')
        internalMonitoring.telemetryEventObservable.subscribe(notifySpy)

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

  describe('when disabled', () => {
    let internalMonitoring: InternalMonitoring
    let notifySpy: jasmine.Spy<(event: TelemetryEvent & Context) => void>

    beforeEach(() => {
      internalMonitoring = startInternalMonitoring(configuration as Configuration)
      notifySpy = jasmine.createSpy('notified')
      internalMonitoring.telemetryEventObservable.subscribe(notifySpy)
    })

    it('should not notify observable', () => {
      callMonitored(() => {
        throw new Error('message')
      })

      expect(notifySpy).not.toHaveBeenCalled()
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
