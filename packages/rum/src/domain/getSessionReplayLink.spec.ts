import type { ViewHistory } from '@datadog/browser-rum-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { createRumSessionManagerMock, mockRumConfiguration } from '../../../rum-core/test'
import { getSessionReplayLink } from './getSessionReplayLink'
import { addRecord } from './replayStats'

const SESSION_ID = '00000000-0000-0000-0000-000000000001'
const DEFAULT_CONFIGURATION = mockRumConfiguration({
  site: 'datadoghq.com',
  sessionSampleRate: 100,
  sessionReplaySampleRate: 100,
})

describe('getReplayLink', () => {
  it('should return url without query param if no view', () => {
    const sessionManager = createRumSessionManagerMock().setId(SESSION_ID)
    const viewHistory = { findView: () => undefined } as ViewHistory

    const link = getSessionReplayLink(DEFAULT_CONFIGURATION, sessionManager, viewHistory, true)

    expect(link).toBe(`https://app.datadoghq.com/rum/replay/sessions/${SESSION_ID}?`)
  })

  it('should return the replay link', () => {
    const sessionManager = createRumSessionManagerMock().setId(SESSION_ID)
    const viewHistory = {
      findView: () => ({
        id: 'view-id-1',
        startClocks: {
          timeStamp: 123456,
        },
      }),
    } as ViewHistory
    addRecord('view-id-1')

    const link = getSessionReplayLink(
      { ...DEFAULT_CONFIGURATION, subdomain: 'toto' },
      sessionManager,
      viewHistory,
      true
    )

    expect(link).toBe(`https://toto.datadoghq.com/rum/replay/sessions/${SESSION_ID}?seed=view-id-1&from=123456`)
  })

  it('should return link when replay is forced', () => {
    const sessionManager = createRumSessionManagerMock()
      .setId(SESSION_ID)
      .setTrackedWithoutSessionReplay()
      .setForcedReplay()

    const viewHistory = {
      findView: () => ({
        id: 'view-id-1',
        startClocks: {
          timeStamp: 123456,
        },
      }),
    } as ViewHistory
    addRecord('view-id-1')

    const noReplayConfig = { ...DEFAULT_CONFIGURATION, subdomain: 'toto', sessionReplaySampleRate: 0 }
    const link = getSessionReplayLink(noReplayConfig, sessionManager, viewHistory, true)

    expect(link).toBe(`https://toto.datadoghq.com/rum/replay/sessions/${SESSION_ID}?seed=view-id-1&from=123456`)
  })

  it('return a param if replay is sampled out', () => {
    const sessionManager = createRumSessionManagerMock().setId(SESSION_ID)
    const viewHistory = {
      findView: () => ({
        id: 'view-id-1',
        startClocks: {
          timeStamp: 123456,
        },
      }),
    } as ViewHistory

    const noReplayConfig = { ...DEFAULT_CONFIGURATION, sessionReplaySampleRate: 0 }
    const link = getSessionReplayLink(noReplayConfig, sessionManager, viewHistory, true)
    expect(link).toBe(
      `https://app.datadoghq.com/rum/replay/sessions/${SESSION_ID}?error-type=incorrect-session-plan&seed=view-id-1&from=123456`
    )
  })

  it('return a param if rum is sampled out', () => {
    const sessionManager = createRumSessionManagerMock().setNotTracked()
    const viewHistory = {
      findView: () => undefined,
    } as ViewHistory

    const link = getSessionReplayLink(DEFAULT_CONFIGURATION, sessionManager, viewHistory, true)

    expect(link).toBe('https://app.datadoghq.com/rum/replay/sessions/no-session-id?error-type=rum-not-tracked')
  })

  it('should add a param if the replay was not started', () => {
    const sessionManager = createRumSessionManagerMock().setId(SESSION_ID)
    const viewHistory = {
      findView: () => ({
        id: 'view-id-1',
        startClocks: {
          timeStamp: 123456,
        },
      }),
    } as ViewHistory

    const link = getSessionReplayLink(DEFAULT_CONFIGURATION, sessionManager, viewHistory, false)

    expect(link).toBe(
      `https://app.datadoghq.com/rum/replay/sessions/${SESSION_ID}?error-type=replay-not-started&seed=view-id-1&from=123456`
    )
  })

  describe('browser not supported', () => {
    beforeEach(() => {
      // browser support function rely on Array.from being a function.
      const original = Array.from
      Array.from = undefined as any

      registerCleanupTask(() => {
        Array.from = original
      })
    })

    it('should add a param if the browser is not supported', () => {
      const sessionManager = createRumSessionManagerMock().setId(SESSION_ID)
      const viewContexts = {
        findView: () => ({
          id: 'view-id-1',
          startClocks: {
            timeStamp: 123456,
          },
        }),
      } as ViewHistory

      const link = getSessionReplayLink(DEFAULT_CONFIGURATION, sessionManager, viewContexts, false)

      expect(link).toBe(
        `https://app.datadoghq.com/rum/replay/sessions/${SESSION_ID}?error-type=browser-not-supported&seed=view-id-1&from=123456`
      )
    })
  })
})
