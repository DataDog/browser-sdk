import type { RelativeTime, TrackingConsentState } from '@datadog/browser-core'
import { DISCARDED, HookNames, TrackingConsent, createTrackingConsentState } from '@datadog/browser-core'
import type { LogsSessionManager } from '../logsSessionManager'
import type { DefaultLogsEventAttributes, Hooks } from '../hooks'
import { createHooks } from '../hooks'
import type { LogsConfiguration } from '../configuration'
import { createLogsSessionManagerMock } from '../../../test/mockLogsSessionManager'
import { startSessionContext } from './sessionContext'

describe('session context', () => {
  let hooks: Hooks
  let sessionManager: LogsSessionManager
  let trackingConsentState: TrackingConsentState
  const configuration = { service: 'foo' } as LogsConfiguration

  beforeEach(() => {
    hooks = createHooks()
    sessionManager = createLogsSessionManagerMock().setTracked()
    trackingConsentState = createTrackingConsentState(TrackingConsent.GRANTED)
  })

  it('should set service', () => {
    startSessionContext(hooks, configuration, sessionManager, trackingConsentState)

    const defaultLogAttributes = hooks.triggerHook(HookNames.Assemble, {
      startTime: 0 as RelativeTime,
    }) as DefaultLogsEventAttributes

    expect(defaultLogAttributes.service).toEqual(jasmine.any(String))
  })

  it('should discard logs if session is not tracked', () => {
    startSessionContext(hooks, configuration, createLogsSessionManagerMock().setNotTracked(), trackingConsentState)

    const defaultLogAttributes = hooks.triggerHook(HookNames.Assemble, {
      startTime: 0 as RelativeTime,
    })

    expect(defaultLogAttributes).toBe(DISCARDED)
  })

  it('should set session id if session is active', () => {
    startSessionContext(hooks, configuration, createLogsSessionManagerMock().setTracked(), trackingConsentState)

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
    startSessionContext(hooks, configuration, createLogsSessionManagerMock().expire(), trackingConsentState)

    const defaultLogAttributes = hooks.triggerHook(HookNames.Assemble, {
      startTime: 0 as RelativeTime,
    })

    expect(defaultLogAttributes).toEqual({
      service: jasmine.any(String),
      session_id: undefined,
      session: undefined,
    })
  })

  it('should discard logs if tracking consent is not granted', () => {
    const notGrantedTrackingConsent = createTrackingConsentState(TrackingConsent.NOT_GRANTED)
    startSessionContext(hooks, configuration, sessionManager, notGrantedTrackingConsent)

    const defaultLogAttributes = hooks.triggerHook(HookNames.Assemble, {
      startTime: 0 as RelativeTime,
    })

    expect(defaultLogAttributes).toBe(DISCARDED)
  })
})
