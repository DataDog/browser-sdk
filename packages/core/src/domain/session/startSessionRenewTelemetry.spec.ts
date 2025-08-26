import type { MockTelemetry } from '@datadog/browser-core/test'
import type { Clock } from '../../../test'
import { mockClock, startMockTelemetry } from '../../../test'
import { ONE_SECOND } from '../../tools/utils/timeUtils'
import { startSessionRenewTelemetry } from './startSessionRenewTelemetry'
import {} from './storeStrategies/sessionStoreStrategy'

describe('startSessionRenewTelemetry', () => {
  let sessionRenewTelemetry: ReturnType<typeof startSessionRenewTelemetry>
  let telemetry: MockTelemetry
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
    sessionRenewTelemetry = startSessionRenewTelemetry()
    telemetry = startMockTelemetry()
  })

  it('should not send telemetry on first renewal', async () => {
    const sessionCache = { id: 'cache-id' }
    const sessionState = { id: 'state-id' }

    sessionRenewTelemetry.onRenew(sessionCache, sessionState)

    expect(await telemetry.hasEvents()).toEqual(false)
  })

  it('should not send telemetry when renewals are more than 1 second apart', async () => {
    const sessionCache = { id: 'cache-id' }
    const sessionState = { id: 'state-id' }

    sessionRenewTelemetry.onRenew(sessionCache, sessionState)
    clock.tick(ONE_SECOND + 1)
    sessionRenewTelemetry.onRenew(sessionCache, sessionState)
    clock.tick(ONE_SECOND + 1)
    sessionRenewTelemetry.onRenew(sessionCache, sessionState)

    expect(await telemetry.hasEvents()).toEqual(false)
  })

  it('should send telemetry after 2 fast renewals', async () => {
    const sessionCache = { id: 'cache-id' }
    const sessionState = { id: 'state-id' }

    clock.tick(ONE_SECOND - 1)

    // First renewal - starts tracking
    sessionRenewTelemetry.onRenew(sessionCache, sessionState)
    clock.tick(ONE_SECOND - 1)
    // Second renewal - within 1 second (first fast renewal)
    sessionRenewTelemetry.onRenew(sessionCache, sessionState)

    expect(await telemetry.getEvents()).toEqual([
      jasmine.objectContaining({
        debug: {
          sessionCache,
          sessionState,
          rawCookie: undefined,
        },
      }),
    ])
  })
})
