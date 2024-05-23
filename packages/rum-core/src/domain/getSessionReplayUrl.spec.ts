import type { ClocksState } from '@datadog/browser-core'
import type { RumConfiguration, RumSession } from '@datadog/browser-rum-core'

import { getSessionReplayUrl, getDatadogSiteUrl } from './getSessionReplayUrl'

describe('getDatadogSiteUrl', () => {
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
      const link = getDatadogSiteUrl({ site, subdomain } as RumConfiguration)

      expect(link).toBe(`https://${host}`)
    })
  })
})

describe('getSessionReplayUrl', () => {
  const parameters = [
    [
      {
        testCase: 'session, no view, no error',
        session: { id: 'session-id-1' } as RumSession,
        viewContext: undefined,
        errorType: undefined,
        expected: 'https://app.datadoghq.com/rum/replay/sessions/session-id-1?',
      },
    ],
    [
      {
        testCase: 'no session, no view, error',
        session: undefined,
        viewContext: undefined,
        errorType: 'toto',
        expected: 'https://app.datadoghq.com/rum/replay/sessions/no-session-id?error-type=toto',
      },
    ],
    [
      {
        testCase: 'session, view, no error',
        session: { id: 'session-id-2' } as RumSession,
        viewContext: { id: 'view-id-1', startClocks: { relative: 0, timeStamp: 1234 } as ClocksState },
        errorType: undefined,
        expected: 'https://app.datadoghq.com/rum/replay/sessions/session-id-2?seed=view-id-1&from=1234',
      },
    ],
    [
      {
        testCase: 'session, view, error',
        session: { id: 'session-id-3' } as RumSession,
        viewContext: { id: 'view-id-2', startClocks: { relative: 0, timeStamp: 1234 } as ClocksState },
        errorType: 'titi',
        expected: 'https://app.datadoghq.com/rum/replay/sessions/session-id-3?error-type=titi&seed=view-id-2&from=1234',
      },
    ],
  ]

  parameters.forEach(([{ testCase, session, viewContext, errorType, expected }]) => {
    it(`should build url when ${testCase}`, () => {
      const link = getSessionReplayUrl({ site: 'datadoghq.com' } as RumConfiguration, {
        session,
        viewContext,
        errorType,
      })
      expect(link).toBe(expected)
    })
  })
})
