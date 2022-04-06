import type { Context } from '../../tools/context'
import type { Configuration } from '../configuration'
import { updateExperimentalFeatures, resetExperimentalFeatures } from '../configuration'
import type { InternalMonitoring, MonitoringMessage } from './internalMonitoring'
import {
  monitor,
  monitored,
  resetInternalMonitoring,
  startInternalMonitoring,
  callMonitored,
} from './internalMonitoring'
import type { TelemetryEvent } from './telemetryEvent.types'

const configuration: Partial<Configuration> = {
  maxInternalMonitoringMessagesPerPage: 7,
}

describe('internal monitoring', () => {
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

      afterEach(() => {
        resetInternalMonitoring()
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

    afterEach(() => {
      resetInternalMonitoring()
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

    afterEach(() => {
      resetInternalMonitoring()
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

  describe('new telemetry', () => {
    let internalMonitoring: InternalMonitoring
    let notifySpy: jasmine.Spy<(event: TelemetryEvent & Context) => void>

    describe('when enabled', () => {
      beforeEach(() => {
        updateExperimentalFeatures(['telemetry'])
        internalMonitoring = startInternalMonitoring(configuration as Configuration)
        notifySpy = jasmine.createSpy('notified')
        internalMonitoring.telemetryEventObservable.subscribe(notifySpy)
      })

      afterEach(() => {
        resetExperimentalFeatures()
        resetInternalMonitoring()
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
    })

    describe('when disabled', () => {
      beforeEach(() => {
        internalMonitoring = startInternalMonitoring(configuration as Configuration)
        notifySpy = jasmine.createSpy('notified')
        internalMonitoring.telemetryEventObservable.subscribe(notifySpy)
      })

      afterEach(() => {
        resetInternalMonitoring()
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
