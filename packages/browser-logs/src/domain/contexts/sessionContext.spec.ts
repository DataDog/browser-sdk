import { beforeEach, describe, expect, it } from 'vitest'
import type { RelativeTime, SessionManager } from '@datadog/browser-core'
import { DISCARDED, HookNames } from '@datadog/browser-core'
import { createSessionManagerMock } from '@datadog/browser-core/test'
import type { DefaultLogsEventAttributes, Hooks } from '../hooks'
import { createHooks } from '../hooks'
import type { LogsConfiguration } from '../configuration'
import { startSessionContext } from './sessionContext'

describe('session context', () => {
  let hooks: Hooks
  let sessionManager: SessionManager
  const configuration = { service: 'foo' } as LogsConfiguration

  beforeEach(() => {
    hooks = createHooks()
    sessionManager = createSessionManagerMock().setTracked()
  })

  describe('assemble  hook', () => {
    it('should set service', () => {
      startSessionContext(hooks, configuration, sessionManager)

      const defaultLogAttributes = hooks.triggerHook(HookNames.Assemble, {
        startTime: 0 as RelativeTime,
      }) as DefaultLogsEventAttributes

      expect(defaultLogAttributes.service).toEqual(expect.any(String))
    })

    it('should discard logs if session is not tracked', () => {
      startSessionContext(hooks, configuration, createSessionManagerMock().setNotTracked())

      const defaultLogAttributes = hooks.triggerHook(HookNames.Assemble, {
        startTime: 0 as RelativeTime,
      })

      expect(defaultLogAttributes).toBe(DISCARDED)
    })

    it('should set session id if session is active', () => {
      startSessionContext(hooks, configuration, createSessionManagerMock().setTracked())

      const defaultLogAttributes = hooks.triggerHook(HookNames.Assemble, {
        startTime: 0 as RelativeTime,
      })

      expect(defaultLogAttributes).toEqual({
        service: expect.any(String),
        session_id: expect.any(String),
        session: { id: expect.any(String) },
      })
    })

    it('should no set session id if session has expired', () => {
      const sessionManagerMock = createSessionManagerMock()
      sessionManagerMock.expire()
      startSessionContext(hooks, configuration, sessionManagerMock)

      const defaultLogAttributes = hooks.triggerHook(HookNames.Assemble, {
        startTime: 0 as RelativeTime,
      })

      expect(defaultLogAttributes).toEqual({
        service: expect.any(String),
        session_id: undefined,
        session: undefined,
      })
    })
  })
})
