import type { Context } from '../../tools/context'
import { display } from '../../tools/display'
import type { Configuration } from '../configuration'
import {
  updateExperimentalFeatures,
  resetExperimentalFeatures,
  INTAKE_SITE_US,
  INTAKE_SITE_US3,
  INTAKE_SITE_EU,
  INTAKE_SITE_US5,
} from '../configuration'
import type { InternalMonitoring, MonitoringMessage } from './internalMonitoring'
import {
  monitor,
  monitored,
  resetInternalMonitoring,
  startInternalMonitoring,
  callMonitored,
  setDebugMode,
} from './internalMonitoring'
import type { TelemetryEvent } from './telemetryEvent.types'

const configuration: Partial<Configuration> = {
  maxInternalMonitoringMessagesPerPage: 7,
  telemetrySampleRate: 100,
}

describe('internal monitoring', () => {
  afterEach(() => {
    resetInternalMonitoring()
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
      let notifySpy: jasmine.Spy<(message: MonitoringMessage) => void>

      beforeEach(() => {
        const { monitoringMessageObservable } = startInternalMonitoring(configuration as Configuration)
        notifySpy = jasmine.createSpy('notified')
        monitoringMessageObservable.subscribe(notifySpy)
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

        const message = notifySpy.calls.mostRecent().args[0]
        expect(message.message).toEqual('monitored')
        expect(message.error!.stack).toMatch('monitored')
      })

      it('should report string error', () => {
        candidate.monitoredStringErrorThrowing()

        const message = notifySpy.calls.mostRecent().args[0]
        expect(message.message).toEqual('Uncaught "string error"')
        expect(message.error!.stack).toMatch('Not an instance of error')
      })

      it('should report object error', () => {
        candidate.monitoredObjectErrorThrowing()

        const message = notifySpy.calls.mostRecent().args[0]
        expect(message.message).toEqual('Uncaught {"foo":"bar"}')
        expect(message.error!.stack).toMatch('Not an instance of error')
      })
    })
  })

  describe('function', () => {
    const notThrowing = () => 1
    const throwing = () => {
      throw new Error('error')
    }
    let notifySpy: jasmine.Spy<(message: MonitoringMessage) => void>

    beforeEach(() => {
      const { monitoringMessageObservable } = startInternalMonitoring(configuration as Configuration)
      notifySpy = jasmine.createSpy('notified')
      monitoringMessageObservable.subscribe(notifySpy)
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

        expect(notifySpy.calls.mostRecent().args[0].message).toEqual('error')
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

        expect(notifySpy.calls.mostRecent().args[0].message).toEqual('error')
      })
    })
  })

  describe('external context', () => {
    let internalMonitoring: InternalMonitoring
    let notifySpy: jasmine.Spy<(message: MonitoringMessage) => void>

    beforeEach(() => {
      internalMonitoring = startInternalMonitoring(configuration as Configuration)
      notifySpy = jasmine.createSpy('notified')
      internalMonitoring.monitoringMessageObservable.subscribe(notifySpy)
    })

    it('should be added to error messages', () => {
      internalMonitoring.setExternalContextProvider(() => ({
        foo: 'bar',
      }))
      callMonitored(() => {
        throw new Error('message')
      })
      expect(notifySpy.calls.mostRecent().args[0].foo).toEqual('bar')

      internalMonitoring.setExternalContextProvider(() => ({}))
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
    })

    afterEach(() => {
      resetExperimentalFeatures()
    })

    it('when not called, should not display error', () => {
      startInternalMonitoring(configuration as Configuration)

      callMonitored(() => {
        throw new Error('message')
      })

      expect(displaySpy).not.toHaveBeenCalled()
    })

    it('when called, should display error', () => {
      startInternalMonitoring(configuration as Configuration)
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

  describe('new telemetry', () => {
    let internalMonitoring: InternalMonitoring
    let notifySpy: jasmine.Spy<(event: TelemetryEvent & Context) => void>

    describe('rollout', () => {
      ;[
        { site: INTAKE_SITE_US5, enabled: true },
        { site: INTAKE_SITE_US3, enabled: true },
        { site: INTAKE_SITE_EU, enabled: false },
        { site: INTAKE_SITE_US, enabled: false },
      ].forEach(({ site, enabled }) => {
        it(`should be ${enabled ? 'enabled' : 'disabled'} on ${site}`, () => {
          internalMonitoring = startInternalMonitoring({ ...configuration, site } as Configuration)
          notifySpy = jasmine.createSpy('notified')
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

    describe('when enabled', () => {
      beforeEach(() => {
        updateExperimentalFeatures(['telemetry'])
        internalMonitoring = startInternalMonitoring(configuration as Configuration)
        notifySpy = jasmine.createSpy('notified')
        internalMonitoring.telemetryEventObservable.subscribe(notifySpy)
      })

      afterEach(() => {
        resetExperimentalFeatures()
      })

      it('should notify observable', () => {
        callMonitored(() => {
          throw new Error('message')
        })

        expect(notifySpy).toHaveBeenCalled()
        const telemetryEvent = notifySpy.calls.mostRecent().args[0]
        expect(telemetryEvent.type).toEqual('telemetry')
        expect(telemetryEvent.telemetry).toEqual({
          status: 'error',
          message: 'message',
          error: jasmine.any(Object),
        })
      })

      it('should add telemetry context', () => {
        internalMonitoring.setTelemetryContextProvider(() => ({ foo: 'bar' }))

        callMonitored(() => {
          throw new Error('message')
        })

        expect(notifySpy).toHaveBeenCalled()
        const telemetryEvent = notifySpy.calls.mostRecent().args[0]
        expect(telemetryEvent.foo).toEqual('bar')
      })

      it('should still use existing system', () => {
        internalMonitoring.setExternalContextProvider(() => ({
          foo: 'bar',
        }))
        const oldNotifySpy = jasmine.createSpy<(message: MonitoringMessage) => void>('old')
        internalMonitoring.monitoringMessageObservable.subscribe(oldNotifySpy)

        callMonitored(() => {
          throw new Error('message')
        })

        expect(oldNotifySpy.calls.mostRecent().args[0].foo).toEqual('bar')
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

    describe('when disabled', () => {
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
})
