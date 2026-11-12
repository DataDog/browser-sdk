import {
  DEV_REPLAY_SANDBOX_ORIGIN,
  DEV_REPLAY_SANDBOX_URL,
  PROD_REPLAY_SANDBOX_ORIGIN,
  PROD_REPLAY_SANDBOX_VERSION_URL,
} from '../../common/packagesUrlConstants'

export interface ReplaySandboxLocation {
  /** The origin that the sandbox sends its messages from. */
  origin: string
  /** The URL of the sandbox page, without query parameters. */
  url: string
}

/** Gets the location of the replay sandbox to load. */
export async function getReplaySandboxLocation(
  useDevReplaySandbox: boolean,
  signal: AbortSignal
): Promise<ReplaySandboxLocation> {
  if (useDevReplaySandbox) {
    return { origin: DEV_REPLAY_SANDBOX_ORIGIN, url: DEV_REPLAY_SANDBOX_URL }
  }

  const version = await fetchProdReplaySandboxVersion(signal)
  return {
    origin: PROD_REPLAY_SANDBOX_ORIGIN,
    url: `${PROD_REPLAY_SANDBOX_ORIGIN}/static-app/v/${encodeURIComponent(version)}/index.html`,
  }
}

async function fetchProdReplaySandboxVersion(signal: AbortSignal): Promise<string> {
  const response = await fetch(PROD_REPLAY_SANDBOX_VERSION_URL, { credentials: 'omit', signal })
  if (!response.ok) {
    throw new Error(`The replay sandbox version request failed with status ${response.status}`)
  }

  const body = (await response.json()) as { version?: unknown } | null
  const version = body?.version
  if (typeof version !== 'string' || version === '') {
    throw new Error('The replay sandbox version response has no version')
  }
  return version
}
