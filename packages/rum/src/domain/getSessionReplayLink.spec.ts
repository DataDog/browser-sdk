import { isIE } from '@datadog/browser-core'
import type { RumConfiguration, ViewHistory } from '@datadog/browser-rum-core'
import { createRumSessionManagerMock } from '../../../rum-core/test'
import { getSessionReplayLink } from './getSessionReplayLink'
import { addRecord, resetReplayStats } from './replayStats'

const DEFAULT_CONFIGURATION = {
  site: 'datad0g.com',
} as RumConfiguration

describe('getReplayLink', () => {
  afterEach(() => {
    resetReplayStats()
  })
  it('should return url without query param if no view', () => {
    const sessionManager = createRumSessionManagerMock().setId('session-id-1')
    const viewHistory = { findView: () => undefined } as ViewHistory

    const link = getSessionReplayLink(DEFAULT_CONFIGURATION, sessionManager, viewHistory, true)

    expect(link).toBe(
      isIE()
        ? 'https://dd.datad0g.com/rum/replay/sessions/session-id-1?error-type=browser-not-supported'
        : 'https://dd.datad0g.com/rum/replay/sessions/session-id-1?'
    )
  })

  it('should return the replay link', () => {
    const sessionManager = createRumSessionManagerMock().setId('session-id-1')
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
      { ...DEFAULT_CONFIGURATION, site: 'datadoghq.com', subdomain: 'toto' },
      sessionManager,
      viewHistory,
      true
    )

    expect(link).toBe(
      isIE()
        ? 'https://toto.datadoghq.com/rum/replay/sessions/session-id-1?error-type=browser-not-supported&seed=view-id-1&from=123456'
        : 'https://toto.datadoghq.com/rum/replay/sessions/session-id-1?seed=view-id-1&from=123456'
    )
  })

  it('should return link when replay is forced', () => {
    const sessionManager = createRumSessionManagerMock()
      .setId('session-id-1')
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

    const link = getSessionReplayLink(
      { ...DEFAULT_CONFIGURATION, site: 'datadoghq.com', subdomain: 'toto' },
      sessionManager,
      viewHistory,
      true
    )

    expect(link).toBe(
      isIE()
        ? 'https://toto.datadoghq.com/rum/replay/sessions/session-id-1?error-type=browser-not-supported&seed=view-id-1&from=123456'
        : 'https://toto.datadoghq.com/rum/replay/sessions/session-id-1?seed=view-id-1&from=123456'
    )
  })

  it('return a param if replay is sampled out', () => {
    const sessionManager = createRumSessionManagerMock().setId('session-id-1').setTrackedWithoutSessionReplay()
    const viewHistory = {
      findView: () => ({
        id: 'view-id-1',
        startClocks: {
          timeStamp: 123456,
        },
      }),
    } as ViewHistory

    const link = getSessionReplayLink(
      { ...DEFAULT_CONFIGURATION, site: 'datadoghq.com' },
      sessionManager,
      viewHistory,
      true
    )
    const errorType = isIE() ? 'browser-not-supported' : 'incorrect-session-plan'
    expect(link).toBe(
      `https://app.datadoghq.com/rum/replay/sessions/session-id-1?error-type=${errorType}&seed=view-id-1&from=123456`
    )
  })

  it('return a param if rum is sampled out', () => {
    const sessionManager = createRumSessionManagerMock().setNotTracked()
    const viewHistory = {
      findView: () => undefined,
    } as ViewHistory

    const link = getSessionReplayLink(
      { ...DEFAULT_CONFIGURATION, site: 'datadoghq.com' },
      sessionManager,
      viewHistory,
      true
    )

    const errorType = isIE() ? 'browser-not-supported' : 'rum-not-tracked'
    expect(link).toBe(`https://app.datadoghq.com/rum/replay/sessions/no-session-id?error-type=${errorType}`)
  })

  it('should add a param if the replay was not started', () => {
    const sessionManager = createRumSessionManagerMock().setId('session-id-1')
    const viewHistory = {
      findView: () => ({
        id: 'view-id-1',
        startClocks: {
          timeStamp: 123456,
        },
      }),
    } as ViewHistory

    const link = getSessionReplayLink(
      { ...DEFAULT_CONFIGURATION, site: 'datadoghq.com' },
      sessionManager,
      viewHistory,
      false
    )

    const errorType = isIE() ? 'browser-not-supported' : 'replay-not-started'
    expect(link).toBe(
      `https://app.datadoghq.com/rum/replay/sessions/session-id-1?error-type=${errorType}&seed=view-id-1&from=123456`
    )
  })
})
