import type { RumConfiguration, RumSession, ViewContext } from '@datadog/browser-rum-core'
import { getSessionReplayUrl, getDatadogSiteUrl } from './getDatadogUrl'

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
  const parameters: Array<
    [string | undefined, { viewId: string; ts: number } | undefined, string | undefined, string]
  > = [
    ['session-id-1', undefined, undefined, 'https://app.datadoghq.com/rum/replay/sessions/session-id-1?'],
    [undefined, undefined, 'toto', 'https://app.datadoghq.com/rum/replay/sessions/no-session-id?error-type=toto'],
    [
      'session-id-2',
      { viewId: 'view-id-1', ts: 1234 },
      undefined,
      'https://app.datadoghq.com/rum/replay/sessions/session-id-2?seed=view-id-1&from=1234',
    ],
    [
      'session-id-3',
      { viewId: 'view-id-2', ts: 1234 },
      'titi',
      'https://app.datadoghq.com/rum/replay/sessions/session-id-3?error-type=titi&seed=view-id-2&from=1234',
    ],
  ]

  parameters.forEach(([sessionId, viewData, errorType, expected]) => {
    it(`should return ${expected} for sessionId "${sessionId ?? 'no-session-id'}" with "${JSON.stringify(
      viewData ?? null
    )}" as view context`, () => {
      const session = sessionId
        ? ({
            id: sessionId,
          } as RumSession)
        : undefined
      const viewContext = viewData
        ? ({
            id: viewData.viewId,
            startClocks: {
              timeStamp: viewData.ts,
            },
          } as ViewContext)
        : undefined

      const link = getSessionReplayUrl({ site: 'datadoghq.com' } as RumConfiguration, {
        viewContext,
        session,
        errorType,
      })

      expect(link).toBe(expected)
    })
  })
})
