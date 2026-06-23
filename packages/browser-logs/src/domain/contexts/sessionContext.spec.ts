import type { RelativeTime } from '@openobserve/js-core/time'
import type { SessionManager } from '@openobserve/browser-core'
import { createHook, DISCARDED } from '@openobserve/js-core/assembly'
import { createSessionManagerMock } from '@openobserve/browser-core/test'
import type { AssembleHook, DefaultLogsEventAttributes } from '../hooks'
import type { LogsConfiguration } from '../configuration'
import { startSessionContext } from './sessionContext'

describe('session context', () => {
  let hook: AssembleHook
  let sessionManager: SessionManager
  const configuration = { service: 'foo' } as LogsConfiguration

  beforeEach(() => {
    hook = createHook()
    sessionManager = createSessionManagerMock().setTracked()
  })

  describe('assemble  hook', () => {
    it('should set service', () => {
      startSessionContext(hook, configuration, sessionManager)

      const defaultLogAttributes = hook.trigger({
        startTime: 0 as RelativeTime,
      }) as DefaultLogsEventAttributes

      expect(defaultLogAttributes.service).toEqual(jasmine.any(String))
    })

    it('should discard logs if session is not tracked', () => {
      startSessionContext(hook, configuration, createSessionManagerMock().setNotTracked())

      const defaultLogAttributes = hook.trigger({
        startTime: 0 as RelativeTime,
      })

      expect(defaultLogAttributes).toBe(DISCARDED)
    })

    it('should set session id if session is active', () => {
      startSessionContext(hook, configuration, createSessionManagerMock().setTracked())

      const defaultLogAttributes = hook.trigger({
        startTime: 0 as RelativeTime,
      })

      expect(defaultLogAttributes).toEqual({
        service: jasmine.any(String),
        session_id: jasmine.any(String),
        session: { id: jasmine.any(String) },
      })
    })

    it('should no set session id if session has expired', () => {
      const sessionManagerMock = createSessionManagerMock()
      sessionManagerMock.expire()
      startSessionContext(hook, configuration, sessionManagerMock)

      const defaultLogAttributes = hook.trigger({
        startTime: 0 as RelativeTime,
      })

      expect(defaultLogAttributes).toEqual({
        service: jasmine.any(String),
        session_id: undefined,
        session: undefined,
      })
    })
  })
})
