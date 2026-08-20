// OAuth (authorization_code + PKCE) against Datadog's first-party OAuth server, used to fetch the
// feature-flag catalog without asking the user to paste API/App keys. The client is PUBLIC (no
// secret), so PKCE is the only client proof. Tokens live in chrome.storage.session — never on disk.
// See FFL-2596.

import { mockable } from '../../../../../../packages/browser-core/src/tools/mockable'

// Separate registered clients. The prod one is replicated across all prod DCs, so every non-staging
// site shares it. Both are public PKCE clients.
const STAGING_CLIENT_ID = '13c94d15-067d-4263-a309-be4811141419'
const PROD_CLIENT_ID = '2c19b57d-118a-4f52-bcfb-709503a68290'

function getClientId(site: string): string {
  return site === 'datad0g.com' ? STAGING_CLIENT_ID : PROD_CLIENT_ID
}
// GET /api/v2/team needs no scope (it's gated on the user's Datadog permissions), so "My teams"
// works without teams_read.
const REQUIRED_SCOPES = ['feature_flag_config_read', 'feature_flag_environment_config_read']
const TOKENS_STORAGE_KEY = 'flagsOAuthTokens'
// Refresh slightly early so a slow request can't race the clock.
const EXPIRY_SKEW_MS = 60_000

export interface OAuthTokens {
  accessToken: string
  refreshToken?: string
  /** Absolute epoch-ms timestamp at which accessToken stops being valid. */
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

/**
 * The Datadog sites the Flags tab can connect to. A fixed list rather than a free-text host, so
 * there's no user-entered domain to validate against phishing.
 *
 * Hosts follow the standard scheme: US1 and EU1 are served from `app.`, regional sites from their
 * own subdomain, staging from `dd.`. Every non-staging site shares one prod OAuth client (see
 * getClientId), which is replicated across the commercial DCs.
 *
 * FED (`ddog-gov.com`, `us2.ddog-gov.com`) is deliberately absent — GovCloud is a separate
 * deployment and the client isn't registered there. Offering a site whose sign-in always fails is
 * worse than omitting it.
 */
export const FLAG_SITES: FlagSite[] = [
  { site: 'datadoghq.com', host: 'app.datadoghq.com', label: 'US1 (datadoghq.com)' },
  { site: 'us3.datadoghq.com', host: 'us3.datadoghq.com', label: 'US3 (us3.datadoghq.com)' },
  { site: 'us5.datadoghq.com', host: 'us5.datadoghq.com', label: 'US5 (us5.datadoghq.com)' },
  { site: 'datadoghq.eu', host: 'app.datadoghq.eu', label: 'EU1 (datadoghq.eu)' },
  { site: 'ap1.datadoghq.com', host: 'ap1.datadoghq.com', label: 'AP1 (ap1.datadoghq.com)' },
  { site: 'ap2.datadoghq.com', host: 'ap2.datadoghq.com', label: 'AP2 (ap2.datadoghq.com)' },
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

/**
 * Exported and mockable so tests can stub the hash: crypto.subtle needs a secure context, which some
 * CI browsers lack. The extension itself always has one (chrome-extension:// origin).
 */
export function sha256(data: BufferSource): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', data)
}

async function generatePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomBase64Url(48)
  const digest = await mockable(sha256)(new TextEncoder().encode(verifier))
  return { verifier, challenge: base64UrlEncode(digest) }
}

/**
 * Normalizes a token response. `fallbackRefreshToken` carries the previous refresh token forward:
 * refresh responses omit `refresh_token` when the server doesn't rotate it, and dropping it would
 * force a full re-login at the next expiry.
 */
function toTokens(raw: RawTokenResponse, fallbackRefreshToken?: string): OAuthTokens {
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token ?? fallbackRefreshToken,
    expiresAt: Date.now() + (raw.expires_in ?? 3600) * 1000,
  }
}

/**
 * Thrown by requestToken on a non-ok response. `invalidGrant` marks the RFC 6749 case where the
 * refresh token itself is dead (expired/revoked/reused), as opposed to a transient 5xx or rate limit.
 */
class TokenRequestError extends Error {
  constructor(
    message: string,
    readonly invalidGrant: boolean
  ) {
    super(message)
  }
}

async function requestToken(host: string, body: URLSearchParams, fallbackRefreshToken?: string): Promise<OAuthTokens> {
  const response = await fetch(`https://${host}/oauth2/v1/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { error?: string } | null
    throw new TokenRequestError(
      `Token request failed: ${response.status} ${response.statusText}`,
      errorBody?.error === 'invalid_grant'
    )
  }
  return toTokens((await response.json()) as RawTokenResponse, fallbackRefreshToken)
}

/**
 * Runs the interactive OAuth flow: opens Datadog's login/consent screen, then exchanges the
 * returned authorization code for tokens. Returns the tokens (caller is responsible for storing).
 */
export function loginWithOAuth(site: string): Promise<OAuthTokens> {
  return authorize(site, REQUIRED_SCOPES)
}

async function authorize(site: string, scopes: string[]): Promise<OAuthTokens> {
  const host = getFlagsApiHost(site)
  const redirectUri = chrome.identity.getRedirectURL()
  const { verifier, challenge } = await generatePkce()
  const state = randomBase64Url(16)

  const authUrl = new URL(`https://${host}/oauth2/v1/authorize`)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', getClientId(site))
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('scope', scopes.join(' '))
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
  // Check CSRF state before acting on ANY other param, including `error`, so a forged callback can't
  // drive our error handling with attacker-controlled values.
  if (returned.searchParams.get('state') !== state) {
    throw new Error('State mismatch — aborting for safety')
  }
  const errorParam = returned.searchParams.get('error')
  if (errorParam) {
    const description = returned.searchParams.get('error_description') ?? errorParam
    throw new Error(`Authorization failed: ${description}`)
  }
  // Datadog appends `domain`, naming the site actually authenticated against. If it disagrees with
  // our selection, abort rather than store tokens that would be used against a different site.
  const returnedDomain = returned.searchParams.get('domain')
  if (returnedDomain && returnedDomain.toLowerCase() !== site) {
    throw new Error(`Authenticated against "${returnedDomain}" but "${site}" was selected — aborting login`)
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
      client_id: getClientId(site),
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
      client_id: getClientId(site),
    }),
    refreshToken
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
 * Ends the connection: revokes the grant at Datadog, then drops the local tokens. Clearing locally
 * alone would only make this extension forget them — the grant would stay live and any copy of the
 * refresh token would keep working. Revocation follows https://datatracker.ietf.org/doc/html/rfc7009.
 *
 * Returns whether the revocation succeeded. Local tokens are cleared either way, so a user who asked
 * to disconnect ends up disconnected even if Datadog is unreachable; the caller reports a failure as
 * "the grant may still be active". Only a failure to clear locally rejects — the panel would
 * otherwise claim a disconnection that reopening it would contradict.
 */
export async function revokeAndClearTokens(site: string): Promise<{ revoked: boolean }> {
  const revoked = await tryRevokeGrant(site)
  await clearStoredTokens()
  return { revoked }
}

/**
 * Revokes the refresh token, since that's the renewable part of the grant — revoking only the access
 * token would leave the grant able to mint new ones. The short-lived access token is left to expire
 * on its own, and dropped locally by the caller.
 *
 * Refreshes first: the revoke endpoint authenticates the caller with a Bearer token.
 */
async function tryRevokeGrant(site: string): Promise<boolean> {
  try {
    const accessToken = await getValidAccessToken(site)
    const tokens = await loadStoredTokens()
    if (!accessToken || !tokens) {
      // Nothing usable left to revoke — getValidAccessToken already cleared a dead session.
      return true
    }

    const response = await fetch(`https://${getFlagsApiHost(site)}/oauth2/v1/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${accessToken}`,
      },
      body: new URLSearchParams({
        token: tokens.refreshToken ?? tokens.accessToken,
        token_type_hint: tokens.refreshToken ? 'refresh_token' : 'access_token',
        client_id: getClientId(site),
      }).toString(),
    })
    return response.ok
  } catch {
    // Network failure, or a refresh that couldn't complete: nothing more we can do server-side.
    return false
  }
}

/**
 * Whether a stored token represents a live connection: still valid, or still refreshable (the
 * refresh itself happens lazily at fetch time). An expired token with no refresh token is dead.
 */
export function isTokenUsable(tokens: OAuthTokens | null): boolean {
  return !!tokens && (tokens.expiresAt > Date.now() || !!tokens.refreshToken)
}

// Shared in-flight refresh. The refresh token is single-use (the server rotates it), so overlapping
// refreshes must share one request — otherwise the loser replays a spent token, gets invalid_grant,
// and wipes the tokens the winner just stored, disconnecting the user mid-session.
let pendingRefresh: Promise<OAuthTokens> | null = null

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
  // Apply the skew only when we can actually refresh; otherwise it would discard the last 60s of a
  // still-valid token and force an unnecessary reconnect.
  const skew = tokens.refreshToken ? EXPIRY_SKEW_MS : 0
  if (Date.now() < tokens.expiresAt - skew) {
    return tokens.accessToken
  }
  if (tokens.refreshToken) {
    try {
      // Capture the shared promise in a local so the `finally` below can't race the await.
      const refresh = (pendingRefresh ??= refreshTokens(site, tokens.refreshToken)
        .then(async (refreshed) => {
          await storeTokens(refreshed)
          return refreshed
        })
        .finally(() => {
          pendingRefresh = null
        }))
      return (await refresh).accessToken
    } catch (err) {
      // A dead refresh token means the session is over — drop it and reconnect.
      if (err instanceof TokenRequestError && err.invalidGrant) {
        await clearStoredTokens()
        return null
      }
      // Transient failure while refreshing early: the current token hasn't actually expired, so keep
      // using it and retry on the next call.
      if (Date.now() < tokens.expiresAt) {
        return tokens.accessToken
      }
      throw err
    }
  }
  await clearStoredTokens()
  return null
}
