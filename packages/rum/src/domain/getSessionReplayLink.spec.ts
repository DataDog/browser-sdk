import type { RumConfiguration, ViewContexts } from '@datadog/browser-rum-core'
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
    const viewContexts = { findView: () => undefined } as ViewContexts

    const link = getSessionReplayLink(DEFAULT_CONFIGURATION, sessionManager, viewContexts)

    expect(link).toBe('https://dd.datad0g.com/rum/replay/sessions/session-id-1')
  })

  const parameters: Array<[string, string | undefined, string]> = [
    ['datadoghq.com', undefined, 'app.datadoghq.com'],
    ['datadoghq.com', 'toto', 'toto.datadoghq.com'],
    ['datad0g.com', undefined, 'dd.datad0g.com'],
    ['datad0g.com', 'toto', 'toto.datad0g.com'],
    ['us3.datadoghq.com', undefined, 'us3.datadoghq.com'],
    ['us3.datadoghq.com', 'toto', 'toto.us3.datadoghq.com'],
    ['us5.datadoghq.com', undefined, 'us5.datadoghq.com'],
    ['us5.datadoghq.com', 'toto', 'toto.us5.datadoghq.com'],
  ]

  parameters.forEach(([site, subdomain, host]) => {
    it(`should return ${host} for subdomain "${
      subdomain ?? 'undefined'
    }" on "${site}" with query params if view is found`, () => {
      const sessionManager = createRumSessionManagerMock().setId('session-id-1')
      const viewContexts = {
        findView: () => ({
          id: 'view-id-1',
          startClocks: {
            timeStamp: 123456,
          },
        }),
      } as ViewContexts
      addRecord('view-id-1')

      const link = getSessionReplayLink({ ...DEFAULT_CONFIGURATION, site, subdomain }, sessionManager, viewContexts)

      expect(link).toBe(`https://${host}/rum/replay/sessions/session-id-1?seed=view-id-1&from=123456`)
    })
  })

  it('return a param if replay is sampled out', () => {
    const sessionManager = createRumSessionManagerMock().setId('session-id-1').setPlanWithoutSessionReplay()
    const viewContexts = {
      findView: () => ({
        id: 'view-id-1',
        startClocks: {
          timeStamp: 123456,
        },
      }),
    } as ViewContexts

    const link = getSessionReplayLink({ ...DEFAULT_CONFIGURATION, site: 'datadoghq.com' }, sessionManager, viewContexts)

    expect(link).toBe(
      'https://app.datadoghq.com/rum/replay/sessions/session-id-1?error-type=incorrect-session-plan&seed=view-id-1&from=123456'
    )
  })

  it('return a param if rum is sampled out', () => {
    const sessionManager = createRumSessionManagerMock().setNotTracked()
    const viewContexts = {
      findView: () => undefined,
    } as ViewContexts

    const link = getSessionReplayLink({ ...DEFAULT_CONFIGURATION, site: 'datadoghq.com' }, sessionManager, viewContexts)

    expect(link).toBe('https://app.datadoghq.com/rum/replay/sessions/session-id?error-type=rum-not-tracked')
  })
})
