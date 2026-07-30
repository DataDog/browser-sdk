import { registerCleanupTask, replaceMockable } from '../../../../../../packages/browser-core/test'
import { getFlagsApiHost, loginWithOAuth, sha256 } from './oauth'

describe('oauth', () => {
  describe('getFlagsApiHost', () => {
    it('maps each site to its frontend host (US1/EU1 → app, staging → dd, regional sites as-is)', () => {
      expect(getFlagsApiHost('datadoghq.com')).toBe('app.datadoghq.com')
      expect(getFlagsApiHost('datadoghq.eu')).toBe('app.datadoghq.eu')
      expect(getFlagsApiHost('datad0g.com')).toBe('dd.datad0g.com')
      expect(getFlagsApiHost('us3.datadoghq.com')).toBe('us3.datadoghq.com')
      expect(getFlagsApiHost('ddog-gov.com')).toBe('ddog-gov.com')
    })

    it('throws on a site that is not in the known list', () => {
      expect(() => getFlagsApiHost('evil.example')).toThrowError(/Unknown Datadog site/)
      expect(() => getFlagsApiHost('')).toThrowError(/Unknown Datadog site/)
    })
  })

  describe('loginWithOAuth', () => {
    // loginWithOAuth's PKCE step hashes with crypto.subtle, which is only exposed in a secure
    // context — some CI browsers (mobile devices reached over http) don't provide it. Stub the hash
    // via its mockable seam so these tests don't depend on the runtime's secure-context status.
    // (Production runs on the extension's chrome-extension:// origin, always a secure context.)
    beforeEach(() => {
      replaceMockable(sha256, () => Promise.resolve(new Uint8Array(32).buffer))
    })

    // Stub chrome.identity so launchWebAuthFlow echoes back a redirect built from the state that
    // loginWithOAuth actually generated (so the state check passes and we exercise the domain check).
    function mockChromeIdentity(makeRedirect: (params: { state: string }) => string) {
      const previousChrome = (globalThis as any).chrome
      ;(globalThis as any).chrome = {
        identity: {
          getRedirectURL: () => 'https://ext-id.chromiumapp.org/',
          launchWebAuthFlow: ({ url }: { url: string }) => {
            const state = new URL(url).searchParams.get('state')!
            return Promise.resolve(makeRedirect({ state }))
          },
        },
      }
      registerCleanupTask(() => {
        ;(globalThis as any).chrome = previousChrome
      })
    }

    it('aborts when the redirect domain does not match the selected site', async () => {
      mockChromeIdentity(({ state }) => `https://ext-id.chromiumapp.org/?code=abc&state=${state}&domain=datadoghq.com`)
      const fetchSpy = spyOn(globalThis, 'fetch')

      await expectAsync(loginWithOAuth('datad0g.com')).toBeRejectedWithError(/but "datad0g.com" was selected/)
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('exchanges the code when the redirect domain matches the selected site', async () => {
      mockChromeIdentity(({ state }) => `https://ext-id.chromiumapp.org/?code=abc&state=${state}&domain=datad0g.com`)
      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 })))
      )

      const tokens = await loginWithOAuth('datad0g.com')
      expect(tokens.accessToken).toBe('tok')
    })

    it('proceeds when the redirect omits a domain', async () => {
      mockChromeIdentity(({ state }) => `https://ext-id.chromiumapp.org/?code=abc&state=${state}`)
      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 })))
      )

      const tokens = await loginWithOAuth('datad0g.com')
      expect(tokens.accessToken).toBe('tok')
    })
  })
})
