// Fetches who the signed-in user is, so the catalog can offer the webapp's two identity-scoped
// filters: "My feature flags" (flags whose creator is the signed-in user) and "My teams" (flags
// tagged `team:<handle>` for a team the user belongs to).
//
// The feature-flag API carries no notion of "me" — it filters by creator UUID and by `team:<handle>`
// tag, both of which the caller has to supply. So the two facts below come from Datadog's org
// endpoints rather than from FFE:
//
//   GET /api/v2/current_user  — permissions=OPEN(), so any valid OAuth access token works. This is
//                               why "My feature flags" needs no scope beyond the ones we already ask
//                               for. `data.id` is the user's UUID, the same value the flag API
//                               returns as `created_by`.
//   GET /api/v2/team          — blueprint requires the `teams_read` permission, so this one needs the
//                               `teams_read` scope on the token (see oauth.ts). `filter[me]=true`
//                               narrows to the caller's own teams.
//
// A token without `teams_read` gets a 403 here. That's an expected state, not an error: the team
// filter is then reported unavailable and the rest of the tab carries on.

import { fetchFfeJson, ForbiddenError } from './ffeApi'
import { getFlagsApiHost } from './oauth'

export interface FlagIdentity {
  /** UUID of the signed-in user, or null when it couldn't be resolved. */
  userId: string | null
  /** Handles of the teams the signed-in user belongs to, sorted for stable display. */
  teamHandles: string[]
  /** True when the team lookup was refused for lack of the `teams_read` scope. */
  teamsForbidden: boolean
}

interface RawCurrentUserResponse {
  data?: { id?: string }
}

interface RawTeamResponse {
  data?: Array<{ attributes?: { handle?: string } }>
}

/**
 * Returns the signed-in user's UUID, or null when the response omits it.
 */
export async function fetchCurrentUserId(token: string, site: string): Promise<string | null> {
  const body = await fetchFfeJson<RawCurrentUserResponse>(
    `https://${getFlagsApiHost(site)}/api/v2/current_user`,
    token,
    'Current user request failed'
  )
  return body.data?.id ?? null
}

// The teams endpoint caps `page[size]` at 100; a user in more than 100 teams is unrealistic, so a
// single page covers every real case.
const TEAM_PAGE_SIZE = 100

/**
 * Returns the handles of the teams the signed-in user belongs to. Throws a ForbiddenError (surfaced
 * by fetchFlagIdentity as `teamsForbidden`) when the token lacks `teams_read`.
 */
export async function fetchMyTeamHandles(token: string, site: string): Promise<string[]> {
  const params = new URLSearchParams({
    'filter[me]': 'true',
    // Ask only for the handle: it's the only field the `team:<handle>` tag match needs, and a
    // narrower response keeps customer team metadata out of the extension.
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

  return {
    userId: user.status === 'fulfilled' ? user.value : null,
    teamHandles: teams.status === 'fulfilled' ? teams.value : [],
    teamsForbidden: teams.status === 'rejected' && teams.reason instanceof ForbiddenError,
  }
}
