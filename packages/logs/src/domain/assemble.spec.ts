import type { Context, RelativeTime } from '@datadog/browser-core'
import { ErrorSource, ONE_MINUTE, getTimeStamp, noop, clocksNow } from '@datadog/browser-core'
import type { LogsEvent } from '../logsEvent.types'
import type { Clock } from '../../../core/test/specHelper'
import { mockClock } from '../../../core/test/specHelper'
import { buildAssemble } from './assemble'
import type { LogsConfiguration } from './configuration'
import { validateAndBuildLogsConfiguration } from './configuration'
import type { LogsMessage } from './logger'
import { StatusType } from './logger'
import type { LogsSessionManager } from './logsSessionManager'
import { createSender } from './sender'

describe('assemble', () => {
  const initConfiguration = { clientToken: 'xxx', service: 'service' }
  const SESSION_ID = 'session-id'
  const DEFAULT_MESSAGE = { status: StatusType.info, message: 'message' }

  const sessionManager: LogsSessionManager = {
    findTrackedSession: () => (sessionIsTracked ? { id: SESSION_ID } : undefined),
  }

  let assemble: (message: LogsMessage, currentContext: Context) => Context | undefined
  let beforeSend: (event: LogsEvent) => void | boolean
  let sessionIsTracked: boolean
  let sendLogSpy: jasmine.Spy

  beforeEach(() => {
    sessionIsTracked = true
    sendLogSpy = jasmine.createSpy()
    const configuration = {
      ...validateAndBuildLogsConfiguration(initConfiguration)!,
      maxBatchSize: 1,
      beforeSend: (x: LogsEvent) => beforeSend(x),
    }
    beforeSend = noop
    assemble = buildAssemble(sessionManager, configuration, createSender(sendLogSpy))
    window.DD_RUM = {
      getInternalContext: noop,
    }
  })

  afterEach(() => {
    delete window.DD_RUM
  })

  it('should not assemble when sessionManager is not tracked', () => {
    sessionIsTracked = false

    expect(assemble(DEFAULT_MESSAGE, { foo: 'from-current-context' })).toBeUndefined()
  })

  it('should not assemble if beforeSend returned false', () => {
    beforeSend = () => false
    expect(assemble(DEFAULT_MESSAGE, { foo: 'from-current-context' })).toBeUndefined()
  })

  it('add default, current and RUM context to message', () => {
    spyOn(window.DD_RUM!, 'getInternalContext').and.returnValue({
      view: { url: 'http://from-rum-context.com', id: 'view-id' },
    })

    const assembledMessage = assemble(DEFAULT_MESSAGE, { foo: 'from-current-context' })

    expect(assembledMessage).toEqual({
      foo: 'from-current-context',
      message: DEFAULT_MESSAGE.message,
      service: 'service',
      session_id: SESSION_ID,
      status: DEFAULT_MESSAGE.status,
      view: { url: 'http://from-rum-context.com', id: 'view-id' },
    })
  })

  it('message context should take precedence over RUM context', () => {
    spyOn(window.DD_RUM!, 'getInternalContext').and.returnValue({ session_id: 'from-rum-context' })

    const assembledMessage = assemble({ ...DEFAULT_MESSAGE, session_id: 'from-message-context' }, {})

    expect(assembledMessage!.session_id).toBe('from-message-context')
  })

  it('RUM context should take precedence over current context', () => {
    spyOn(window.DD_RUM!, 'getInternalContext').and.returnValue({ session_id: 'from-rum-context' })

    const assembledMessage = assemble(DEFAULT_MESSAGE, { session_id: 'from-current-context' })

    expect(assembledMessage!.session_id).toBe('from-rum-context')
  })

  it('current context should take precedence over default context', () => {
    const assembledMessage = assemble(DEFAULT_MESSAGE, { service: 'from-current-context' })

    expect(assembledMessage!.service).toBe('from-current-context')
  })

  it('should allow modification of existing fields', () => {
    beforeSend = (event: LogsEvent) => {
      event.message = 'modified message'
      ;(event.service as any) = 'modified service'
    }

    const assembledMessage = assemble(DEFAULT_MESSAGE, {})

    expect(assembledMessage!.message).toBe('modified message')
    expect(assembledMessage!.service).toBe('modified service')
  })

  it('should allow adding new fields', () => {
    beforeSend = (event: LogsEvent) => {
      event.foo = 'bar'
    }

    const assembledMessage = assemble(DEFAULT_MESSAGE, {})

    expect(assembledMessage!.foo).toBe('bar')
  })

  it('should use the rum internal context related to the error time', () => {
    window.DD_RUM = {
      getInternalContext(startTime) {
        return {
          foo: startTime === 1234 ? 'b' : 'a',
        }
      },
    }

    const message = { ...DEFAULT_MESSAGE, date: getTimeStamp(1234 as RelativeTime) }

    const assembledMessage = assemble(message, {})

    expect(assembledMessage!.foo).toBe('b')
  })

  it('should include RUM context', () => {
    window.DD_RUM = {
      getInternalContext() {
        return { view: { url: 'http://from-rum-context.com', id: 'view-id' } }
      },
    }

    const message = { ...DEFAULT_MESSAGE }

    const assembledMessage = assemble(message, {})

    expect(assembledMessage!.view).toEqual({
      id: 'view-id',
      url: 'http://from-rum-context.com',
    })
  })

  describe('logs limitation', () => {
    let clock: Clock
    beforeEach(() => {
      clock = mockClock()
      assemble = buildAssemble(
        sessionManager,
        { eventRateLimiterThreshold: 1, beforeSend: (x: LogsEvent) => beforeSend(x) } as LogsConfiguration,
        createSender(sendLogSpy)
      )
    })

    afterEach(() => {
      clock.cleanup()
    })
    ;[
      { status: StatusType.error, message: 'Reached max number of errors by minute: 1' },
      { status: StatusType.warn, message: 'Reached max number of warns by minute: 1' },
      { status: StatusType.info, message: 'Reached max number of infos by minute: 1' },
      { status: StatusType.debug, message: 'Reached max number of debugs by minute: 1' },
      { status: 'unknown' as StatusType, message: 'Reached max number of customs by minute: 1' },
    ].forEach(({ status, message }) => {
      it(`stops sending ${status} logs when reaching the limit`, () => {
        const assembledMessage1 = assemble({ message: 'foo', status }, {})
        const assembledMessage2 = assemble({ message: 'bar', status }, {})

        expect(assembledMessage1!.message).toBe('foo')
        expect(assembledMessage2).toBeUndefined()

        expect(sendLogSpy).toHaveBeenCalledOnceWith({
          message,
          status: StatusType.error,
          date: clocksNow().timeStamp,
          error: {
            kind: undefined,
            origin: ErrorSource.AGENT,
            stack: undefined,
          },
        })
      })

      it(`does not take discarded ${status} logs into account`, () => {
        const sendLogSpy = jasmine.createSpy<(message: LogsMessage & { foo?: string }) => void>()
        beforeSend = (event) => {
          if (event.message === 'discard me') {
            return false
          }
        }

        const assembledMessage1 = assemble({ message: 'discard me', status }, {})
        const assembledMessage2 = assemble({ message: 'discard me', status }, {})
        const assembledMessage3 = assemble({ message: 'discard me', status }, {})
        const assembledMessage4 = assemble({ message: 'foo', status }, {})

        expect(assembledMessage1).toBeUndefined()
        expect(assembledMessage2).toBeUndefined()
        expect(assembledMessage3).toBeUndefined()
        expect(assembledMessage4!.message).toBe('foo')
        expect(sendLogSpy).not.toHaveBeenCalled()
      })

      it(`allows to send new ${status}s after a minute`, () => {
        const assembledMessage1 = assemble({ message: 'foo', status }, {})
        const assembledMessage2 = assemble({ message: 'bar', status }, {})
        clock.tick(ONE_MINUTE)
        const assembledMessage3 = assemble({ message: 'baz', status }, {})

        expect(assembledMessage2).toBeUndefined()
        expect(assembledMessage1!.message).toBe('foo')
        expect(assembledMessage3!.message).toBe('baz')
      })

      it('allows to send logs with a different status when reaching the limit', () => {
        const otherLogStatus = status === StatusType.error ? 'other' : StatusType.error
        const assembledMessage1 = assemble({ message: 'foo', status }, {})
        const assembledMessage2 = assemble({ message: 'bar', status }, {})
        const assembledMessage3 = assemble({ message: 'baz', status: otherLogStatus as StatusType }, {})

        expect(assembledMessage2).toBeUndefined()
        expect(assembledMessage1!.message).toBe('foo')
        expect(assembledMessage3!.message).toBe('baz')
      })
    })

    it('two different custom statuses are accounted by the same limit', () => {
      const assembledMessage1 = assemble({ message: 'foo', status: 'foo' as StatusType }, {})
      const assembledMessage2 = assemble({ message: 'bar', status: 'bar' as StatusType }, {})

      expect(assembledMessage2).toBeUndefined()
      expect(assembledMessage1!.message).toBe('foo')
    })
  })
})
