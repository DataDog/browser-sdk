import type { Context, RelativeTime, TelemetryEvent, TimeStamp } from '@datadog/browser-core'
import { startTelemetry, ErrorSource, ONE_MINUTE, getTimeStamp, noop } from '@datadog/browser-core'
import { cleanupSyntheticsWorkerValues, mockSyntheticsWorkerValues } from '../../../core/test/syntheticsWorkerValues'
import type { LogsEvent } from '../logsEvent.types'
import type { Clock } from '../../../core/test/specHelper'
import { mockClock } from '../../../core/test/specHelper'
import type { CommonContext } from '../rawLogsEvent.types'
import { getRUMInternalContext, resetRUMInternalContext, startLogsAssembly } from './assembly'
import { validateAndBuildLogsConfiguration } from './configuration'
import { Logger, StatusType } from './logger'
import type { LogsSessionManager } from './logsSessionManager'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'

const initConfiguration = { clientToken: 'xxx', service: 'service' }

describe('startLogsAssembly', () => {
  const SESSION_ID = 'session-id'
  const DEFAULT_MESSAGE = {
    status: StatusType.info,
    message: 'message',
    origin: ErrorSource.LOGGER,
    date: 123456 as TimeStamp,
  }
  const COMMON_CONTEXT: CommonContext = {
    view: {
      referrer: 'referrer_from_common_context',
      url: 'url_from_common_context',
    },
    context: { common_context_key: 'common_context_value' },
  }

  const sessionManager: LogsSessionManager = {
    findTrackedSession: () => (sessionIsTracked ? { id: SESSION_ID } : undefined),
  }

  let beforeSend: (event: LogsEvent) => void | boolean
  let sessionIsTracked: boolean
  let lifeCycle: LifeCycle
  let serverLogs: Array<LogsEvent & Context> = []
  let mainLogger: Logger

  beforeEach(() => {
    sessionIsTracked = true
    lifeCycle = new LifeCycle()
    lifeCycle.subscribe(LifeCycleEventType.LOG_COLLECTED, (serverRumEvent) => serverLogs.push(serverRumEvent))
    const configuration = {
      ...validateAndBuildLogsConfiguration(initConfiguration)!,
      maxBatchSize: 1,
      eventRateLimiterThreshold: 1,
      beforeSend: (x: LogsEvent) => beforeSend(x),
    }
    beforeSend = noop
    mainLogger = new Logger(() => noop)
    startLogsAssembly(sessionManager, configuration, lifeCycle, () => COMMON_CONTEXT, mainLogger)
    window.DD_RUM = {
      getInternalContext: noop,
    }
  })

  afterEach(() => {
    delete window.DD_RUM
    serverLogs = []
  })

  it('should not send if beforeSend returned false', () => {
    beforeSend = () => false
    lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
      rawLogsEvent: DEFAULT_MESSAGE,
    })
    expect(serverLogs.length).toEqual(0)
  })

  it('should not send if session is not tracked', () => {
    sessionIsTracked = false
    lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
      rawLogsEvent: DEFAULT_MESSAGE,
    })
    expect(serverLogs.length).toEqual(0)
  })

  it('should enable/disable the sending when the tracking type change', () => {
    lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
      rawLogsEvent: DEFAULT_MESSAGE,
    })
    expect(serverLogs.length).toEqual(1)

    sessionIsTracked = false
    lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
      rawLogsEvent: DEFAULT_MESSAGE,
    })
    expect(serverLogs.length).toEqual(1)

    sessionIsTracked = true
    lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
      rawLogsEvent: DEFAULT_MESSAGE,
    })
    expect(serverLogs.length).toEqual(2)
  })

  describe('contexts inclusion', () => {
    it('should include message context', () => {
      spyOn(window.DD_RUM!, 'getInternalContext').and.returnValue({
        view: { url: 'http://from-rum-context.com', id: 'view-id' },
      })

      lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
        rawLogsEvent: DEFAULT_MESSAGE,
        messageContext: { foo: 'from-message-context' },
      })

      expect(serverLogs[0].foo).toEqual('from-message-context')
    })

    it('should include common context', () => {
      lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, { rawLogsEvent: DEFAULT_MESSAGE })

      expect(serverLogs[0]).toEqual(
        jasmine.objectContaining({
          view: COMMON_CONTEXT.view,
          ...COMMON_CONTEXT.context,
        })
      )
    })

    it('should include saved common context instead of common context when present', () => {
      const savedCommonContext = {
        view: {
          referrer: 'referrer_from_saved_common_context',
          url: 'url_from_saved_common_context',
        },
        context: { foo: 'bar' },
      }
      lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, { rawLogsEvent: DEFAULT_MESSAGE, savedCommonContext })

      expect(serverLogs[0]).toEqual(
        jasmine.objectContaining({
          view: savedCommonContext.view,
          ...savedCommonContext.context,
        })
      )
      expect(serverLogs[0].common_context_key).toBeUndefined()
    })

    it('should include main logger context', () => {
      mainLogger.setContext({ foo: 'from-main-logger' })
      lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, { rawLogsEvent: DEFAULT_MESSAGE })

      expect(serverLogs[0].foo).toEqual('from-main-logger')
    })

    it('should include logger context instead of main logger context when present', () => {
      const logger = new Logger(() => noop)
      mainLogger.setContext({ foo: 'from-main-logger', bar: 'from-main-logger' })
      logger.setContext({ foo: 'from-logger' })

      lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, { rawLogsEvent: DEFAULT_MESSAGE, logger })

      expect(serverLogs[0].foo).toEqual('from-logger')
      expect(serverLogs[0].bar).toBeUndefined()
    })

    it('should include rum internal context related to the error time', () => {
      window.DD_RUM = {
        getInternalContext(startTime) {
          return { foo: startTime === 1234 ? 'b' : 'a' }
        },
      }

      lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
        rawLogsEvent: { ...DEFAULT_MESSAGE, date: getTimeStamp(1234 as RelativeTime) },
      })

      expect(serverLogs[0].foo).toBe('b')
    })

    it('should include RUM context', () => {
      window.DD_RUM = {
        getInternalContext() {
          return { view: { url: 'http://from-rum-context.com', id: 'view-id' } }
        },
      }

      lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, { rawLogsEvent: DEFAULT_MESSAGE })

      expect(serverLogs[0].view).toEqual({
        id: 'view-id',
        url: 'http://from-rum-context.com',
        referrer: 'referrer_from_common_context',
      })
    })

    it('should include raw log', () => {
      lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, { rawLogsEvent: DEFAULT_MESSAGE })

      expect(serverLogs[0]).toEqual(jasmine.objectContaining(DEFAULT_MESSAGE))
    })
  })

  describe('contexts precedence', () => {
    it('common context should take precedence over service and session_id', () => {
      lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
        rawLogsEvent: DEFAULT_MESSAGE,
        savedCommonContext: {
          ...COMMON_CONTEXT,
          context: { service: 'foo', session_id: 'bar' },
        },
      })

      expect(serverLogs[0].service).toBe('foo')
      expect(serverLogs[0].session_id).toBe('bar')
    })

    it('RUM context should take precedence over common context', () => {
      spyOn(window.DD_RUM!, 'getInternalContext').and.returnValue({ view: { url: 'from-rum-context' } })

      lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, { rawLogsEvent: DEFAULT_MESSAGE })

      expect(serverLogs[0].view.url).toEqual('from-rum-context')
    })

    it('raw log should take precedence over RUM context', () => {
      spyOn(window.DD_RUM!, 'getInternalContext').and.returnValue({ message: 'from-rum-context' })

      lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, { rawLogsEvent: DEFAULT_MESSAGE })

      expect(serverLogs[0].message).toEqual('message')
    })

    it('logger context should take precedence over raw log', () => {
      mainLogger.setContext({ message: 'from-main-logger' })

      lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, { rawLogsEvent: DEFAULT_MESSAGE })

      expect(serverLogs[0].message).toEqual('from-main-logger')
    })

    it('message context should take precedence over logger context', () => {
      lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
        rawLogsEvent: DEFAULT_MESSAGE,
        messageContext: { message: 'from-message-context' },
      })

      expect(serverLogs[0].message).toEqual('from-message-context')
    })
  })

  describe('beforeSend', () => {
    it('should allow modification of existing fields', () => {
      beforeSend = (event: LogsEvent) => {
        event.message = 'modified message'
        ;(event.service as any) = 'modified service'
      }

      lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
        rawLogsEvent: DEFAULT_MESSAGE,
      })

      expect(serverLogs[0].message).toBe('modified message')
      expect(serverLogs[0].service).toBe('modified service')
    })

    it('should allow adding new fields', () => {
      beforeSend = (event: LogsEvent) => {
        event.foo = 'bar'
      }

      lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
        rawLogsEvent: DEFAULT_MESSAGE,
      })

      expect(serverLogs[0].foo).toBe('bar')
    })
  })

  describe('logs limitation', () => {
    let clock: Clock

    beforeEach(() => {
      clock = mockClock()
    })

    afterEach(() => {
      clock.cleanup()
    })
    ;[
      { status: StatusType.error, messageContext: {}, message: 'Reached max number of errors by minute: 1' },
      { status: StatusType.warn, messageContext: {}, message: 'Reached max number of warns by minute: 1' },
      { status: StatusType.info, messageContext: {}, message: 'Reached max number of infos by minute: 1' },
      { status: StatusType.debug, messageContext: {}, message: 'Reached max number of debugs by minute: 1' },
      {
        status: StatusType.debug,
        messageContext: { status: 'unknown' }, // overrides the rawLogsEvent status
        message: 'Reached max number of customs by minute: 1',
      },
    ].forEach(({ status, message, messageContext }) => {
      it(`stops sending ${status} logs when reaching the limit`, () => {
        lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
          rawLogsEvent: { ...DEFAULT_MESSAGE, message: 'foo', status },
          messageContext,
        })
        lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
          rawLogsEvent: { ...DEFAULT_MESSAGE, message: 'bar', status },
          messageContext,
        })

        expect(serverLogs.length).toEqual(2)
        expect(serverLogs[0].message).toBe('foo')
        expect(serverLogs[1]).toEqual(
          jasmine.objectContaining({
            message,
            error: {
              origin: ErrorSource.AGENT,
            },
            origin: ErrorSource.AGENT,
          })
        )
      })

      it(`does not take discarded ${status} logs into account`, () => {
        beforeSend = (event) => {
          if (event.message === 'discard me') {
            return false
          }
        }

        lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
          rawLogsEvent: { ...DEFAULT_MESSAGE, message: 'discard me', status },
          messageContext,
        })
        lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
          rawLogsEvent: { ...DEFAULT_MESSAGE, message: 'discard me', status },
          messageContext,
        })
        lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
          rawLogsEvent: { ...DEFAULT_MESSAGE, message: 'discard me', status },
          messageContext,
        })
        lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
          rawLogsEvent: { ...DEFAULT_MESSAGE, message: 'foo', status },
          messageContext,
        })

        expect(serverLogs.length).toEqual(1)
        expect(serverLogs[0].message).toBe('foo')
      })

      it(`allows to send new ${status}s after a minute`, () => {
        lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
          rawLogsEvent: { ...DEFAULT_MESSAGE, message: 'foo', status },
          messageContext,
        })
        lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
          rawLogsEvent: { ...DEFAULT_MESSAGE, message: 'bar', status },
          messageContext,
        })
        clock.tick(ONE_MINUTE)
        lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
          rawLogsEvent: { ...DEFAULT_MESSAGE, message: 'baz', status },
          messageContext,
        })

        expect(serverLogs.length).toEqual(3)
        expect(serverLogs[0].message).toEqual('foo')
        expect(serverLogs[1].error!.origin).toEqual(ErrorSource.AGENT)
        expect(serverLogs[2].message).toEqual('baz')
      })

      it('allows to send logs with a different status when reaching the limit', () => {
        const otherLogStatus = status === StatusType.error ? StatusType.info : StatusType.error
        lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
          rawLogsEvent: { ...DEFAULT_MESSAGE, message: 'foo', status },
          messageContext,
        })
        lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
          rawLogsEvent: { ...DEFAULT_MESSAGE, message: 'bar', status },
          messageContext,
        })
        lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
          rawLogsEvent: { ...DEFAULT_MESSAGE, message: 'baz', status: otherLogStatus },
          ...{ ...messageContext, status: otherLogStatus },
        })

        expect(serverLogs.length).toEqual(3)
        expect(serverLogs[0].message).toEqual('foo')
        expect(serverLogs[1].error!.origin).toEqual(ErrorSource.AGENT)
        expect(serverLogs[2].message).toEqual('baz')
      })
    })

    it('two different custom statuses are accounted by the same limit', () => {
      lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
        rawLogsEvent: { ...DEFAULT_MESSAGE, message: 'foo', status: StatusType.info },
        messageContext: { status: 'foo' },
      })

      lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
        rawLogsEvent: { ...DEFAULT_MESSAGE, message: 'bar', status: StatusType.info },
        messageContext: { status: 'bar' },
      })

      expect(serverLogs.length).toEqual(2)
      expect(serverLogs[0].message).toEqual('foo')
      expect(serverLogs[1].error!.origin).toEqual(ErrorSource.AGENT)
    })
  })
})

describe('getRUMInternalContext', () => {
  afterEach(() => {
    delete window.DD_RUM
    delete window.DD_RUM_SYNTHETICS
    resetRUMInternalContext()
  })

  it('returns undefined if no RUM instance is present', () => {
    expect(getRUMInternalContext()).toBeUndefined()
  })

  it('returns undefined if the global variable does not have a `getInternalContext` method', () => {
    window.DD_RUM = {} as any
    expect(getRUMInternalContext()).toBeUndefined()
  })

  it('returns the internal context from the `getInternalContext` method', () => {
    window.DD_RUM = {
      getInternalContext: () => ({ foo: 'bar' }),
    }
    expect(getRUMInternalContext()).toEqual({ foo: 'bar' })
  })

  describe('when RUM is injected by Synthetics', () => {
    let telemetrySpy: jasmine.Spy<(event: TelemetryEvent) => void>

    beforeEach(() => {
      mockSyntheticsWorkerValues({ injectsRum: true, publicId: 'test-id', resultId: 'result-id' })
      const telemetry = startTelemetry(
        validateAndBuildLogsConfiguration({ ...initConfiguration, telemetrySampleRate: 100 })!
      )
      telemetrySpy = jasmine.createSpy()
      telemetry.observable.subscribe(telemetrySpy)
    })

    afterEach(() => {
      cleanupSyntheticsWorkerValues()
    })

    it('uses the global variable created when the synthetics worker is injecting RUM', () => {
      window.DD_RUM_SYNTHETICS = {
        getInternalContext: () => ({ foo: 'bar' }),
      }
      expect(getRUMInternalContext()).toEqual({ foo: 'bar' })
    })

    it('adds a telemetry debug event when RUM has not been injected yet', () => {
      getRUMInternalContext()
      expect(telemetrySpy).toHaveBeenCalledOnceWith(
        jasmine.objectContaining({
          telemetry: {
            message: 'Logs sent before RUM is injected by the synthetics worker',
            status: 'debug',
            testId: 'test-id',
            resultId: 'result-id',
          },
        })
      )
    })

    it('adds the telemetry debug event only once', () => {
      getRUMInternalContext()
      getRUMInternalContext()
      expect(telemetrySpy).toHaveBeenCalledTimes(1)
    })
  })
})
