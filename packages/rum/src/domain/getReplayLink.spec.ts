import type { RumConfiguration, ViewContexts } from '@datadog/browser-rum-core'
import { createRumSessionManagerMock } from '../../../rum-core/test/mockRumSessionManager'
import { getReplayLink } from './getReplayLink'

const DEFAULT_CONFIGURATION = {
  site: 'datad0g.com',
} as RumConfiguration

describe('getReplayLink', () => {
  it('should return undefined if there is no session', () => {
    const sessionManager = createRumSessionManagerMock().setNotTracked()
    const viewContexts = {} as ViewContexts

    const link = getReplayLink(DEFAULT_CONFIGURATION, sessionManager, viewContexts, 'app')

    expect(link).toBeUndefined()
  })

  it('should return url without query param if no view', () => {
    const sessionManager = createRumSessionManagerMock().setId('session-id-1')
    const viewContexts = { findView: () => undefined } as ViewContexts

    const link = getReplayLink(DEFAULT_CONFIGURATION, sessionManager, viewContexts, 'app')

    expect(link).toBe('https://app.datad0g.com/rum/replay/sessions/session-id-1')
  })

  it('should return the URL with query params if view is found', () => {
    const sessionManager = createRumSessionManagerMock().setId('session-id-1')
    const viewContexts = {
      findView: () => ({
        id: 'view-id-1',
        startClocks: {
          timeStamp: 123456,
        },
      }),
    } as ViewContexts

    const link = getReplayLink(DEFAULT_CONFIGURATION, sessionManager, viewContexts, 'app')

    expect(link).toBe('https://app.datad0g.com/rum/replay/sessions/session-id-1?seed=view-id-1&from=123456')
  })
})
