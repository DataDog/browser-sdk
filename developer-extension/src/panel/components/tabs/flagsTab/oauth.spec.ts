import { registerCleanupTask, replaceMockable } from '../../../../../../packages/browser-core/test'
import {
  clearStoredTokens,
  getFlagsApiHost,
  getValidAccessToken,
  loadStoredTokens,
  loginWithOAuth,
  sha256,
  storeTokens,
} from './oauth'

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

  describe('getValidAccessToken', () => {
    beforeEach(() => {
      // In-memory chrome.storage.session so token read/write/remove work in the karma browser.
      const previousChrome = (globalThis as any).chrome
      const store: Record<string, unknown> = {}
      ;(globalThis as any).chrome = {
        storage: {
          session: {
            get: (key: string) => Promise.resolve({ [key]: store[key] }),
            set: (items: Record<string, unknown>) => {
              Object.assign(store, items)
              return Promise.resolve()
            },
            remove: (key: string) => {
              delete store[key]
              return Promise.resolve()
            },
          },
        },
      }
      registerCleanupTask(async () => {
        await clearStoredTokens()
        ;(globalThis as any).chrome = previousChrome
      })
    })

    it('returns null when nothing is stored', async () => {
      expect(await getValidAccessToken('datad0g.com')).toBeNull()
    })

    it('returns the stored token while it is still valid', async () => {
      await storeTokens({ accessToken: 'valid', refreshToken: 'r1', expiresAt: Date.now() + 10 * 60_000 })
      expect(await getValidAccessToken('datad0g.com')).toBe('valid')
    })

    it('refreshes an expired token and persists the new one', async () => {
      await storeTokens({ accessToken: 'old', refreshToken: 'r1', expiresAt: Date.now() - 1 })
      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify({ access_token: 'fresh', refresh_token: 'r2', expires_in: 3600 })))
      )

      expect(await getValidAccessToken('datad0g.com')).toBe('fresh')
      const stored = await loadStoredTokens()
      expect(stored?.accessToken).toBe('fresh')
      expect(stored?.refreshToken).toBe('r2')
    })

    it('keeps the previous refresh token when the refresh response omits one', async () => {
      await storeTokens({ accessToken: 'old', refreshToken: 'r1', expiresAt: Date.now() - 1 })
      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify({ access_token: 'fresh', expires_in: 3600 })))
      )

      await getValidAccessToken('datad0g.com')
      expect((await loadStoredTokens())?.refreshToken).toBe('r1')
    })

    it('clears tokens and returns null when the refresh token is invalid_grant', async () => {
      await storeTokens({ accessToken: 'old', refreshToken: 'r1', expiresAt: Date.now() - 1 })
      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }))
      )

      expect(await getValidAccessToken('datad0g.com')).toBeNull()
      expect(await loadStoredTokens()).toBeNull()
    })

    it('keeps the stored token and rethrows on a transient refresh failure after expiry', async () => {
      await storeTokens({ accessToken: 'old', refreshToken: 'r1', expiresAt: Date.now() - 1 })
      spyOn(globalThis, 'fetch').and.returnValue(Promise.resolve(new Response('server error', { status: 503 })))

      await expectAsync(getValidAccessToken('datad0g.com')).toBeRejected()
      expect((await loadStoredTokens())?.refreshToken).toBe('r1')
    })

    it('keeps the stored token and rethrows on a network error during refresh after expiry', async () => {
      await storeTokens({ accessToken: 'old', refreshToken: 'r1', expiresAt: Date.now() - 1 })
      spyOn(globalThis, 'fetch').and.returnValue(Promise.reject(new TypeError('Failed to fetch')))

      await expectAsync(getValidAccessToken('datad0g.com')).toBeRejected()
      expect((await loadStoredTokens())?.refreshToken).toBe('r1')
    })

    it('coalesces concurrent refreshes into a single token request', async () => {
      await storeTokens({ accessToken: 'old', refreshToken: 'r1', expiresAt: Date.now() - 1 })
      const fetchSpy = spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify({ access_token: 'fresh', refresh_token: 'r2', expires_in: 3600 })))
      )

      const [first, second] = await Promise.all([
        getValidAccessToken('datad0g.com'),
        getValidAccessToken('datad0g.com'),
      ])

      expect(first).toBe('fresh')
      expect(second).toBe('fresh')
      // The single-use refresh token must be spent exactly once even under concurrent callers.
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('returns the still-valid token on a transient refresh failure inside the skew window', async () => {
      // Expires in 30s (inside the 60s skew) so we refresh early — but the token is still valid, so a
      // transient failure should fall back to it rather than failing the caller.
      await storeTokens({ accessToken: 'still-valid', refreshToken: 'r1', expiresAt: Date.now() + 30_000 })
      spyOn(globalThis, 'fetch').and.returnValue(Promise.resolve(new Response('server error', { status: 503 })))

      expect(await getValidAccessToken('datad0g.com')).toBe('still-valid')
      expect((await loadStoredTokens())?.refreshToken).toBe('r1')
    })

    it('clears tokens and returns null when expired with no refresh token', async () => {
      await storeTokens({ accessToken: 'old', expiresAt: Date.now() - 1 })

      expect(await getValidAccessToken('datad0g.com')).toBeNull()
      expect(await loadStoredTokens()).toBeNull()
    })

    it('keeps using a still-valid token that has no refresh token (skew only applies when refreshable)', async () => {
      // Inside the 60s skew window, but unrefreshable — should return the token rather than clear it.
      await storeTokens({ accessToken: 'valid', expiresAt: Date.now() + 30_000 })

      expect(await getValidAccessToken('datad0g.com')).toBe('valid')
      expect(await loadStoredTokens()).not.toBeNull()
    })
  })
})
