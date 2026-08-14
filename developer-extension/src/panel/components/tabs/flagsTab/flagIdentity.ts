// Fetches who the signed-in user is, so the catalog can offer the webapp's two identity-scoped
// filters: "My feature flags" (creator is the signed-in user) and "My teams" (flags tagged
// `team:<handle>`). The feature-flag API has no notion of "me" — it filters by creator UUID and by
// tag, both of which the caller must supply — so these come from Datadog's org endpoints instead.
//
// Neither endpoint needs a token scope beyond the ones we already request: current_user is OPEN(),
// and team access is gated on the user's own Datadog permissions.

import { fetchFfeJson, ForbiddenError } from './ffeApi'
import { getFlagsApiHost } from './oauth'

export interface FlagIdentity {
  /** UUID of the signed-in user, or null when it couldn't be resolved. */
  userId: string | null
  /** Handles of the teams the signed-in user belongs to, sorted for stable display. */
  teamHandles: string[]
  /** True when the team lookup was refused because the user lacks permission to read teams. */
  teamsForbidden: boolean
  /** True when the team lookup failed for another reason (network/server), distinct from an empty membership. */
  teamsUnavailable: boolean
}

interface RawCurrentUserResponse {
  data?: { id?: string }
}

interface RawTeamResponse {
  data?: Array<{ attributes?: { handle?: string } }>
}

/**
 * Returns the signed-in user's UUID (the same value the flag API returns as `created_by`), or null
 * when the response omits it.
 */
export async function fetchCurrentUserId(token: string, site: string): Promise<string | null> {
  const body = await fetchFfeJson<RawCurrentUserResponse>(
    `https://${getFlagsApiHost(site)}/api/v2/current_user`,
    token,
    'Current user request failed'
  )
  return body.data?.id ?? null
}

// The endpoint caps `page[size]` at 100; membership in more than 100 teams is unrealistic, so one
// page covers every real case.
const TEAM_PAGE_SIZE = 100

/**
 * Returns the handles of the teams the signed-in user belongs to. Requests only the handle field —
 * it's all the `team:<handle>` tag match needs, and it keeps other team metadata out of the
 * extension. Throws a ForbiddenError (surfaced as `teamsForbidden`) when the user can't read teams.
 */
export async function fetchMyTeamHandles(token: string, site: string): Promise<string[]> {
  const params = new URLSearchParams({
    'filter[me]': 'true',
    'fields[team]': 'handle',
    'page[size]': String(TEAM_PAGE_SIZE),
  })
  const body = await fetchFfeJson<RawTeamResponse>(
    `https://${getFlagsApiHost(site)}/api/v2/team?${params.toString()}`,
    token,
    'Teams request failed'
  )

  const handles = (body.data ?? [])
    .map((team) => team.attributes?.handle)
    .filter((handle): handle is string => !!handle)
  return Array.from(new Set(handles)).sort((a, b) => a.localeCompare(b))
}

/**
 * Resolves both identity facts, tolerating the absence of either. Neither filter is essential to the
 * tab, so a failure downgrades the affected filter instead of failing the whole catalog: the user
 * lookup falling over leaves `userId` null, and a refused team lookup sets `teamsForbidden`.
 */
export async function fetchFlagIdentity(token: string, site: string): Promise<FlagIdentity> {
  const [user, teams] = await Promise.allSettled([fetchCurrentUserId(token, site), fetchMyTeamHandles(token, site)])

  const teamsForbidden = teams.status === 'rejected' && teams.reason instanceof ForbiddenError
  return {
    userId: user.status === 'fulfilled' ? user.value : null,
    teamHandles: teams.status === 'fulfilled' ? teams.value : [],
    teamsForbidden,
    // A non-403 rejection is a genuine lookup failure, not "no teams".
    teamsUnavailable: teams.status === 'rejected' && !teamsForbidden,
  }
}
