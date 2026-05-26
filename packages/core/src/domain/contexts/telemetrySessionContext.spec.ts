import type { Hooks } from '../../../test'
import { createHooks, createSessionManagerMock, MOCK_SESSION_ID } from '../../../test'
import type { RelativeTime } from '../../tools/utils/timeUtils'
import { HookNames } from '../../tools/abstractHooks'
import { startTelemetrySessionContext } from './telemetrySessionContext'

describe('telemetrySessionContext', () => {
  let hooks: Hooks

  beforeEach(() => {
    hooks = createHooks()
  })

  it('should include session id and anonymous_id in assembled telemetry', () => {
    startTelemetrySessionContext(hooks, createSessionManagerMock())

    const result = hooks.triggerHook(HookNames.AssembleTelemetry, { startTime: 0 as RelativeTime })

    expect(result).toEqual({
      session: { id: MOCK_SESSION_ID },
      anonymous_id: 'device-123',
    })
  })

  it('should contribute nothing when no tracked session is found', () => {
    startTelemetrySessionContext(hooks, createSessionManagerMock().setNotTracked())

    const result = hooks.triggerHook(HookNames.AssembleTelemetry, { startTime: 0 as RelativeTime })

    expect(result).toBeUndefined()
  })

  it('should merge extraContext into the result', () => {
    startTelemetrySessionContext(hooks, createSessionManagerMock(), { application: { id: 'app-789' } })

    const result = hooks.triggerHook(HookNames.AssembleTelemetry, { startTime: 0 as RelativeTime })

    expect(result).toEqual({
      session: { id: MOCK_SESSION_ID },
      anonymous_id: 'device-123',
      application: { id: 'app-789' },
    })
  })

  it('should pass startTime to findTrackedSession', () => {
    const sessionManager = createSessionManagerMock()
    spyOn(sessionManager, 'findTrackedSession').and.callThrough()

    startTelemetrySessionContext(hooks, sessionManager)

    hooks.triggerHook(HookNames.AssembleTelemetry, { startTime: 42 as RelativeTime })

    expect(sessionManager.findTrackedSession).toHaveBeenCalledWith(42 as RelativeTime)
  })
})
