import type { Hooks } from '../../../test'
import { createHooks } from '../../../test'
import type { RelativeTime } from '../../tools/utils/timeUtils'
import { HookNames } from '../../tools/abstractHooks'
import type { SessionContext, SessionManager } from '../session/sessionManager'
import { startTelemetrySessionContext } from './telemetrySessionContext'

function mockSessionManager(findTrackedSession: (startTime?: RelativeTime) => SessionContext | undefined) {
  return { findTrackedSession } as unknown as SessionManager
}

describe('telemetrySessionContext', () => {
  let hooks: Hooks

  beforeEach(() => {
    hooks = createHooks()
  })

  it('should include session id and anonymous_id in assembled telemetry', () => {
    startTelemetrySessionContext(
      hooks,
      mockSessionManager(() => ({ id: 'session-123', anonymousId: 'device-456' }))
    )

    const result = hooks.triggerHook(HookNames.AssembleTelemetry, { startTime: 0 as RelativeTime })

    expect(result).toEqual({
      session: { id: 'session-123' },
      anonymous_id: 'device-456',
    })
  })

  it('should contribute nothing when no tracked session is found', () => {
    startTelemetrySessionContext(
      hooks,
      mockSessionManager(() => undefined)
    )

    const result = hooks.triggerHook(HookNames.AssembleTelemetry, { startTime: 0 as RelativeTime })

    expect(result).toBeUndefined()
  })

  it('should merge extraContext into the result', () => {
    startTelemetrySessionContext(
      hooks,
      mockSessionManager(() => ({ id: 'session-abc', anonymousId: 'device-xyz' })),
      { application: { id: 'app-789' } }
    )

    const result = hooks.triggerHook(HookNames.AssembleTelemetry, { startTime: 0 as RelativeTime })

    expect(result).toEqual({
      session: { id: 'session-abc' },
      anonymous_id: 'device-xyz',
      application: { id: 'app-789' },
    })
  })

  it('should pass startTime to findTrackedSession', () => {
    const findTrackedSessionSpy = jasmine
      .createSpy<(startTime?: RelativeTime) => SessionContext | undefined>('findTrackedSession')
      .and.returnValue({ id: 'session-123' } as SessionContext)

    startTelemetrySessionContext(hooks, mockSessionManager(findTrackedSessionSpy))

    hooks.triggerHook(HookNames.AssembleTelemetry, { startTime: 42 as RelativeTime })

    expect(findTrackedSessionSpy).toHaveBeenCalledWith(42 as RelativeTime)
  })
})
