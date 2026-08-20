import { registerCleanupTask, replaceMockable } from '../../../../../../packages/browser-core/test'
import {
  clearStoredTokens,
  FLAG_SITES,
  getFlagsApiHost,
  getValidAccessToken,
  loadStoredTokens,
  loginWithOAuth,
  revokeAndClearTokens,
  sha256,
  storeTokens,
} from './oauth'

describe('oauth', () => {
  // In-memory chrome.storage.session so token read/write/remove work in the karma browser.
  function mockSessionStorage() {
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
  }

  describe('getFlagsApiHost', () => {
    it('maps each site to its frontend host (US1/EU1 → app, regional → own subdomain, staging → dd)', () => {
      expect(getFlagsApiHost('datadoghq.com')).toBe('app.datadoghq.com')
      expect(getFlagsApiHost('datadoghq.eu')).toBe('app.datadoghq.eu')
      expect(getFlagsApiHost('us3.datadoghq.com')).toBe('us3.datadoghq.com')
      expect(getFlagsApiHost('us5.datadoghq.com')).toBe('us5.datadoghq.com')
      expect(getFlagsApiHost('ap1.datadoghq.com')).toBe('ap1.datadoghq.com')
      expect(getFlagsApiHost('ap2.datadoghq.com')).toBe('ap2.datadoghq.com')
      expect(getFlagsApiHost('datad0g.com')).toBe('dd.datad0g.com')
    })

    it('covers every site in FLAG_SITES, so a new entry cannot ship without a host', () => {
      for (const { site, host } of FLAG_SITES) {
        expect(getFlagsApiHost(site)).toBe(host)
      }
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
    function mockChromeIdentity(makeRedirect: (params: { state: string }, url: string) => string) {
      const previousChrome = (globalThis as any).chrome
      ;(globalThis as any).chrome = {
        identity: {
          getRedirectURL: () => 'https://ext-id.chromiumapp.org/',
          launchWebAuthFlow: ({ url }: { url: string }) => {
            const state = new URL(url).searchParams.get('state')!
            return Promise.resolve(makeRedirect({ state }, url))
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

    it('sends the prod client id for a prod site and the staging client id for staging', async () => {
      const clientIdByHost: Record<string, string | null> = {}
      mockChromeIdentity(({ state }, url) => {
        const requestUrl = new URL(url)
        clientIdByHost[requestUrl.hostname] = requestUrl.searchParams.get('client_id')
        // Omit `domain` so the flow proceeds to the (stubbed) token exchange.
        return `https://ext-id.chromiumapp.org/?code=abc&state=${state}`
      })
      // Fresh Response per call — two logins each read the token-exchange body once.
      spyOn(globalThis, 'fetch').and.callFake(() =>
        Promise.resolve(new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 })))
      )

      await loginWithOAuth('datadoghq.com') // US1 (prod)
      await loginWithOAuth('datad0g.com') // staging

      expect(clientIdByHost['app.datadoghq.com']).toBe('2c19b57d-118a-4f52-bcfb-709503a68290')
      expect(clientIdByHost['dd.datad0g.com']).toBe('13c94d15-067d-4263-a309-be4811141419')
    })

    it('proceeds when the redirect omits a domain', async () => {
      mockChromeIdentity(({ state }) => `https://ext-id.chromiumapp.org/?code=abc&state=${state}`)
      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 })))
      )

      const tokens = await loginWithOAuth('datad0g.com')
      expect(tokens.accessToken).toBe('tok')
    })

    it('requests only the feature-flag scopes', async () => {
      const requestedScopes: string[] = []
      mockChromeIdentity(({ state }, url) => {
        requestedScopes.push(new URL(url).searchParams.get('scope')!)
        return `https://ext-id.chromiumapp.org/?code=abc&state=${state}`
      })
      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 })))
      )

      await loginWithOAuth('datad0g.com')
      expect(requestedScopes.length).toBe(1)
      expect(requestedScopes[0].split(' ')).toEqual([
        'feature_flag_config_read',
        'feature_flag_environment_config_read',
      ])
    })

    it('surfaces a popup failure without a second attempt', async () => {
      let attempts = 0
      const previousChrome = (globalThis as any).chrome
      ;(globalThis as any).chrome = {
        identity: {
          getRedirectURL: () => 'https://ext-id.chromiumapp.org/',
          launchWebAuthFlow: () => {
            attempts += 1
            return Promise.reject(new Error('The user did not approve access.'))
          },
        },
      }
      registerCleanupTask(() => {
        ;(globalThis as any).chrome = previousChrome
      })

      await expectAsync(loginWithOAuth('datad0g.com')).toBeRejectedWithError(/did not approve/)
      expect(attempts).toBe(1)
    })

    it('surfaces an authorization error from the redirect without a second attempt', async () => {
      let attempts = 0
      mockChromeIdentity(({ state }) => {
        attempts += 1
        return `https://ext-id.chromiumapp.org/?error=access_denied&state=${state}`
      })

      await expectAsync(loginWithOAuth('datad0g.com')).toBeRejectedWithError(/access_denied/)
      expect(attempts).toBe(1)
    })
  })

  describe('revokeAndClearTokens', () => {
    beforeEach(mockSessionStorage)

    it('revokes the refresh token and clears local tokens', async () => {
      await storeTokens({ accessToken: 'a1', refreshToken: 'r1', expiresAt: Date.now() + 10 * 60_000 })
      const fetchSpy = spyOn(globalThis, 'fetch').and.returnValue(Promise.resolve(new Response('', { status: 200 })))

      expect(await revokeAndClearTokens('datad0g.com')).toEqual({ revoked: true })
      expect(await loadStoredTokens()).toBeNull()

      const [url, init] = fetchSpy.calls.argsFor(0) as [string, RequestInit]
      expect(url).toBe('https://dd.datad0g.com/oauth2/v1/revoke')
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer a1')
      const body = new URLSearchParams(init.body as string)
      // Revoking the refresh token cascades to the access tokens minted from it; revoking only the
      // access token would leave the grant renewable.
      expect(body.get('token')).toBe('r1')
      expect(body.get('token_type_hint')).toBe('refresh_token')
    })

    it('revokes the access token when there is no refresh token', async () => {
      await storeTokens({ accessToken: 'a1', expiresAt: Date.now() + 10 * 60_000 })
      const fetchSpy = spyOn(globalThis, 'fetch').and.returnValue(Promise.resolve(new Response('', { status: 200 })))

      expect(await revokeAndClearTokens('datad0g.com')).toEqual({ revoked: true })
      const body = new URLSearchParams((fetchSpy.calls.argsFor(0)[1] as RequestInit).body as string)
      expect(body.get('token')).toBe('a1')
      expect(body.get('token_type_hint')).toBe('access_token')
    })

    it('still clears local tokens when the revocation is refused', async () => {
      await storeTokens({ accessToken: 'a1', refreshToken: 'r1', expiresAt: Date.now() + 10 * 60_000 })
      spyOn(globalThis, 'fetch').and.returnValue(Promise.resolve(new Response('', { status: 400 })))

      expect(await revokeAndClearTokens('datad0g.com')).toEqual({ revoked: false })
      expect(await loadStoredTokens()).toBeNull()
    })

    it('still clears local tokens when the network fails', async () => {
      await storeTokens({ accessToken: 'a1', refreshToken: 'r1', expiresAt: Date.now() + 10 * 60_000 })
      spyOn(globalThis, 'fetch').and.returnValue(Promise.reject(new TypeError('Failed to fetch')))

      expect(await revokeAndClearTokens('datad0g.com')).toEqual({ revoked: false })
      expect(await loadStoredTokens()).toBeNull()
    })

    it('reports success without a request when there is nothing left to revoke', async () => {
      const fetchSpy = spyOn(globalThis, 'fetch')

      expect(await revokeAndClearTokens('datad0g.com')).toEqual({ revoked: true })
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })

  describe('getValidAccessToken', () => {
    beforeEach(mockSessionStorage)

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
