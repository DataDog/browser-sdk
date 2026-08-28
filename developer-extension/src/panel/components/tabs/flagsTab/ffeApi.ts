// Shared helper for the FFE API calls the Flags tab makes (catalog, current user, teams). Centralizes
// the bearer-auth header + response handling that flagsRequests.ts and flagIdentity.ts would
// otherwise each repeat.

// Thrown on a 403 so callers can tell "the token lacks the scope" apart from a real failure (used by
// flagIdentity to degrade the team filter rather than fail the whole tab).
export class ForbiddenError extends Error {}

/**
 * GETs a JSON resource from the FFE API with the OAuth bearer token. Throws ForbiddenError on 403 and
 * a generic Error on any other non-2xx, prefixing the message with `errorLabel`. Keep customer data
 * (e.g. a flag key) out of `errorLabel` — these errors are logged and the panel forwards logs to its
 * own telemetry.
 */
export async function fetchFfeJson<T>(url: string, token: string, errorLabel: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (response.status === 403) {
    throw new ForbiddenError(`${errorLabel}: 403 ${response.statusText}`)
  }
  if (!response.ok) {
    throw new Error(`${errorLabel}: ${response.status} ${response.statusText}`)
  }
  return (await response.json()) as T
}
