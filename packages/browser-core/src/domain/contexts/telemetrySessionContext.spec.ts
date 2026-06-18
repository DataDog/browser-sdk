import type { RelativeTime } from '@datadog/js-core/time'
import type { Hook } from '@datadog/js-core/assembly'
import { createHook } from '@datadog/js-core/assembly'
import { createSessionManagerMock, MOCK_SESSION_ID } from '../../../test'
import { startTelemetrySessionContext } from './telemetrySessionContext'

describe('telemetrySessionContext', () => {
  let hook: Hook<any, any>

  beforeEach(() => {
    hook = createHook()
  })

  it('should include session id and anonymous_id in assembled telemetry', () => {
    startTelemetrySessionContext(hook, createSessionManagerMock())

    const result = hook.trigger({ startTime: 0 as RelativeTime })

    expect(result).toEqual({
      session: { id: MOCK_SESSION_ID },
      anonymous_id: 'device-123',
    })
  })

  it('should contribute nothing when no tracked session is found', () => {
    startTelemetrySessionContext(hook, createSessionManagerMock().setNotTracked())

    const result = hook.trigger({ startTime: 0 as RelativeTime })

    expect(result).toBeUndefined()
  })

  it('should merge extraContext into the result', () => {
    startTelemetrySessionContext(hook, createSessionManagerMock(), { application: { id: 'app-789' } })

    const result = hook.trigger({ startTime: 0 as RelativeTime })

    expect(result).toEqual({
      session: { id: MOCK_SESSION_ID },
      anonymous_id: 'device-123',
      application: { id: 'app-789' },
    })
  })

  it('should pass startTime to findTrackedSession', () => {
    const sessionManager = createSessionManagerMock()
    spyOn(sessionManager, 'findTrackedSession').and.callThrough()

    startTelemetrySessionContext(hook, sessionManager)

    hook.trigger({ startTime: 42 as RelativeTime })

    expect(sessionManager.findTrackedSession).toHaveBeenCalledWith(42 as RelativeTime)
  })
})
