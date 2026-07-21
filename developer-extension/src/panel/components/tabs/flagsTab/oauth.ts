// OAuth (authorization_code + PKCE) against Datadog's first-party OAuth server, used to fetch
// the feature-flag catalog without asking the user to paste API/App keys.
//
// The client is a PUBLIC client (no secret), so PKCE is the only client proof. Tokens live in
// chrome.storage.session (cleared when the browser session ends) — never persisted to disk.
// See FFL-2596 / the OAuth CLI client `13c94d15-067d-4263-a309-be4811141419` (staging).

const CLIENT_ID = '13c94d15-067d-4263-a309-be4811141419'
const SCOPES = ['feature_flag_config_read', 'feature_flag_environment_config_read']
const TOKENS_STORAGE_KEY = 'flagsOAuthTokens'
// Refresh a bit before the token actually expires to avoid racing the clock on a slow request.
const EXPIRY_SKEW_MS = 60_000

export interface OAuthTokens {
  accessToken: string
  refreshToken?: string
  // Absolute epoch-ms timestamp at which accessToken stops being valid.
  expiresAt: number
}

interface RawTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
}

/**
 * Maps a customer-facing site to the host that serves the OAuth endpoints and the FFE UI API.
 * Mirrors the mapping used in infosTab.tsx (app.<site>, except the staging alias dd.datad0g.com).
 */
export function getFlagsApiHost(site: string): string {
  if (site === 'datadoghq.com') {
    return 'app.datadoghq.com'
  }
  if (site === 'datad0g.com') {
    return 'dd.datad0g.com'
  }
  return `app.${site}`
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes.buffer)
}

async function generatePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomBase64Url(48)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return { verifier, challenge: base64UrlEncode(digest) }
}

function toTokens(raw: RawTokenResponse): OAuthTokens {
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token,
    expiresAt: Date.now() + (raw.expires_in ?? 3600) * 1000,
  }
}

async function requestToken(host: string, body: URLSearchParams): Promise<OAuthTokens> {
  const response = await fetch(`https://${host}/oauth2/v1/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!response.ok) {
    throw new Error(`Token request failed: ${response.status} ${response.statusText}`)
  }
  return toTokens((await response.json()) as RawTokenResponse)
}

/**
 * Runs the interactive OAuth flow: opens Datadog's login/consent screen, then exchanges the
 * returned authorization code for tokens. Returns the tokens (caller is responsible for storing).
 */
export async function loginWithOAuth(site: string): Promise<OAuthTokens> {
  const host = getFlagsApiHost(site)
  const redirectUri = chrome.identity.getRedirectURL()
  const { verifier, challenge } = await generatePkce()
  const state = randomBase64Url(16)

  const authUrl = new URL(`https://${host}/oauth2/v1/authorize`)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('scope', SCOPES.join(' '))
  authUrl.searchParams.set('code_challenge', challenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  authUrl.searchParams.set('state', state)

  const redirectResponse = await chrome.identity.launchWebAuthFlow({
    url: authUrl.toString(),
    interactive: true,
  })
  if (!redirectResponse) {
    throw new Error('Authorization was cancelled')
  }

  const returned = new URL(redirectResponse)
  const errorParam = returned.searchParams.get('error')
  if (errorParam) {
    throw new Error(`Authorization failed: ${returned.searchParams.get('error_description') ?? errorParam}`)
  }
  if (returned.searchParams.get('state') !== state) {
    throw new Error('State mismatch — aborting for safety')
  }
  const code = returned.searchParams.get('code')
  if (!code) {
    throw new Error('No authorization code returned')
  }

  return requestToken(
    host,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    })
  )
}

function refreshTokens(site: string, refreshToken: string): Promise<OAuthTokens> {
  return requestToken(
    getFlagsApiHost(site),
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    })
  )
}

export async function loadStoredTokens(): Promise<OAuthTokens | null> {
  const result = await chrome.storage.session.get(TOKENS_STORAGE_KEY)
  return (result[TOKENS_STORAGE_KEY] as OAuthTokens | undefined) ?? null
}

export async function storeTokens(tokens: OAuthTokens): Promise<void> {
  await chrome.storage.session.set({ [TOKENS_STORAGE_KEY]: tokens })
}

export async function clearStoredTokens(): Promise<void> {
  await chrome.storage.session.remove(TOKENS_STORAGE_KEY)
}

/**
 * Returns a currently-valid access token, transparently refreshing if it has expired. Returns
 * null (and clears any stored tokens) when there is no usable token — the caller should then
 * prompt the user to reconnect.
 */
export async function getValidAccessToken(site: string): Promise<string | null> {
  const tokens = await loadStoredTokens()
  if (!tokens) {
    return null
  }
  if (Date.now() < tokens.expiresAt - EXPIRY_SKEW_MS) {
    return tokens.accessToken
  }
  if (tokens.refreshToken) {
    try {
      const refreshed = await refreshTokens(site, tokens.refreshToken)
      await storeTokens(refreshed)
      return refreshed.accessToken
    } catch {
      await clearStoredTokens()
      return null
    }
  }
  await clearStoredTokens()
  return null
}
