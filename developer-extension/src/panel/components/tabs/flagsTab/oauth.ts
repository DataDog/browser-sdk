// OAuth (authorization_code + PKCE) against Datadog's first-party OAuth server, used to fetch
// the feature-flag catalog without asking the user to paste API/App keys.
//
// The client is a PUBLIC client (no secret), so PKCE is the only client proof. Tokens live in
// chrome.storage.session (cleared when the browser session ends) — never persisted to disk.
// See FFL-2596 / the OAuth CLI client `13c94d15-067d-4263-a309-be4811141419` (staging).

import { mockable } from '../../../../../../packages/browser-core/src/tools/mockable'

const CLIENT_ID = '13c94d15-067d-4263-a309-be4811141419'
const SCOPES = ['feature_flag_config_read', 'feature_flag_environment_config_read']
const TOKENS_STORAGE_KEY = 'flagsOAuthTokens'

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

export interface FlagSite {
  /** Bare site value stored in settings and shown in the UI (e.g. "datadoghq.com"). */
  site: string
  /** Frontend host serving that site's OAuth endpoints and FFE API. */
  host: string
  /** Human-readable label for the site picker. */
  label: string
}

// The Datadog sites the Flags tab can connect to, each paired with the frontend host that serves
// its OAuth endpoints and FFE API. The site is chosen from this fixed list (a Select in the UI), so
// there's no free-text host to validate against phishing — the value is always one of these. Host
// subdomains mirror the canonical builder in browser-rum-core's getSessionReplayUrl.ts: US1 and EU1
// get `app.`, staging gets `dd.`, and the remaining sites are already their own host.
export const FLAG_SITES: FlagSite[] = [
  { site: 'datadoghq.com', host: 'app.datadoghq.com', label: 'US1 (datadoghq.com)' },
  { site: 'us3.datadoghq.com', host: 'us3.datadoghq.com', label: 'US3 (us3.datadoghq.com)' },
  { site: 'us5.datadoghq.com', host: 'us5.datadoghq.com', label: 'US5 (us5.datadoghq.com)' },
  { site: 'datadoghq.eu', host: 'app.datadoghq.eu', label: 'EU1 (datadoghq.eu)' },
  { site: 'ap1.datadoghq.com', host: 'ap1.datadoghq.com', label: 'AP1 (ap1.datadoghq.com)' },
  { site: 'ap2.datadoghq.com', host: 'ap2.datadoghq.com', label: 'AP2 (ap2.datadoghq.com)' },
  { site: 'ddog-gov.com', host: 'ddog-gov.com', label: 'US1-FED (ddog-gov.com)' },
  { site: 'us2.ddog-gov.com', host: 'us2.ddog-gov.com', label: 'US2-FED (us2.ddog-gov.com)' },
  { site: 'datad0g.com', host: 'dd.datad0g.com', label: 'Staging (datad0g.com)' },
]

/**
 * Returns the frontend host serving OAuth + FFE for a site. Throws on an unknown site: the UI only
 * ever passes a value from FLAG_SITES, so an unknown one means a stale or hand-edited setting.
 */
export function getFlagsApiHost(site: string): string {
  const match = FLAG_SITES.find((entry) => entry.site === site)
  if (!match) {
    throw new Error(`Unknown Datadog site: "${site}"`)
  }
  return match.host
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

// Exported and wrapped with mockable() so tests can stub the hash: crypto.subtle is only exposed in
// a secure context, which some CI browsers (mobile devices reached over http) don't provide. The
// extension itself runs on a chrome-extension:// origin, which is always a secure context.
export function sha256(data: BufferSource): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', data)
}

async function generatePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomBase64Url(48)
  const digest = await mockable(sha256)(new TextEncoder().encode(verifier))
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
  // Datadog appends `domain` to the redirect, naming the site the user actually authenticated
  // against (bare site form, e.g. "datad0g.com"). `site` is our source of truth for every host we
  // talk to, so if they disagree we abort rather than store tokens that would later be used
  // against a different site than the one they were issued for.
  const returnedDomain = returned.searchParams.get('domain')
  if (returnedDomain && returnedDomain.toLowerCase() !== site) {
    throw new Error(`Authenticated against "${returnedDomain}" but "${site}" was selected — aborting login`)
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
 * Whether a stored token represents a live connection: still valid, or still refreshable (the
 * refresh itself happens lazily at fetch time). An expired token with no refresh token is dead.
 */
export function isTokenUsable(tokens: OAuthTokens | null): boolean {
  return !!tokens && (tokens.expiresAt > Date.now() || !!tokens.refreshToken)
}
