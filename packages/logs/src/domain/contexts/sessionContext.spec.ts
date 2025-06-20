import type { RelativeTime } from '@datadog/browser-core'
import { DISCARDED, HookNames } from '@datadog/browser-core'
import type { LogsSessionManager } from '../logsSessionManager'
import type { DefaultLogsEventAttributes, Hooks } from '../hooks'
import { createHooks } from '../hooks'
import type { LogsConfiguration } from '../configuration'
import { createLogsSessionManagerMock } from '../../../test/mockLogsSessionManager'
import { startSessionContext } from './sessionContext'

describe('session context', () => {
  let hooks: Hooks
  let sessionManager: LogsSessionManager
  const configuration = { service: 'foo' } as LogsConfiguration

  beforeEach(() => {
    hooks = createHooks()
    sessionManager = createLogsSessionManagerMock().setTracked()
  })

  it('should set service', () => {
    startSessionContext(hooks, configuration, sessionManager)

    const defaultLogAttributes = hooks.triggerHook(HookNames.Assemble, {
      startTime: 0 as RelativeTime,
    }) as DefaultLogsEventAttributes

    expect(defaultLogAttributes.service).toEqual(jasmine.any(String))
  })

  it('should discard logs if session is not tracked', () => {
    startSessionContext(hooks, configuration, createLogsSessionManagerMock().setNotTracked())

    const defaultLogAttributes = hooks.triggerHook(HookNames.Assemble, {
      startTime: 0 as RelativeTime,
    })

    expect(defaultLogAttributes).toBe(DISCARDED)
  })

  it('should set session id if session is active', () => {
    startSessionContext(hooks, configuration, createLogsSessionManagerMock().setTracked())

    const defaultLogAttributes = hooks.triggerHook(HookNames.Assemble, {
      startTime: 0 as RelativeTime,
    })

    expect(defaultLogAttributes).toEqual({
      service: jasmine.any(String),
      session_id: jasmine.any(String),
      session: { id: jasmine.any(String) },
    })
  })

  it('should no set session id if session has expired', () => {
    startSessionContext(hooks, configuration, createLogsSessionManagerMock().expire())

    const defaultLogAttributes = hooks.triggerHook(HookNames.Assemble, {
      startTime: 0 as RelativeTime,
    })

    expect(defaultLogAttributes).toEqual({
      service: jasmine.any(String),
      session_id: undefined,
      session: undefined,
    })
  })
})
