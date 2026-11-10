import {
  DEV_REPLAY_SANDBOX_ORIGIN,
  DEV_REPLAY_SANDBOX_URL,
  PROD_REPLAY_SANDBOX_ORIGIN,
  PROD_REPLAY_SANDBOX_VERSION_URL,
  STATIC_HASH_REPLAY_SANDBOX_ORIGIN,
} from '../../common/packagesUrlConstants'

const STATIC_HASH_PATTERN = /^[0-9a-f]{32}$/

export interface ReplaySandboxLocation {
  /** The origin that the sandbox sends its messages from. */
  origin: string
  /** The URL of the sandbox page, without query parameters. */
  url: string
}

export type ReplaySandboxSource = { type: 'prod' } | { type: 'local' } | { type: 'static-hash'; hash: string }

export interface ReplaySandboxLocationOptions {
  source: ReplaySandboxSource
  signal: AbortSignal
}

/** Thrown when no sandbox build exists for the requested static hash. */
export class NoSandboxBuildError extends Error {
  constructor() {
    super('No sandbox build for this hash')
  }
}

/** Gets the location of the replay sandbox to load. */
export async function getReplaySandboxLocation({
  source,
  signal,
}: ReplaySandboxLocationOptions): Promise<ReplaySandboxLocation> {
  if (source.type === 'local') {
    return { origin: DEV_REPLAY_SANDBOX_ORIGIN, url: DEV_REPLAY_SANDBOX_URL }
  }
  if (source.type === 'static-hash') {
    return getStaticHashReplaySandboxLocation(source.hash, signal)
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

async function getStaticHashReplaySandboxLocation(hash: string, signal: AbortSignal): Promise<ReplaySandboxLocation> {
  // Ensure that the hash is valid. (And that it doesn't change the URL path.)
  if (!STATIC_HASH_PATTERN.test(hash)) {
    throw new NoSandboxBuildError()
  }

  const url = `${STATIC_HASH_REPLAY_SANDBOX_ORIGIN}/static-app/_h/${hash}/index.html`

  // Ensure the build exists, because the sandbox can't report an error if it doesn't load.
  const response = await fetch(url, { method: 'HEAD', credentials: 'omit', signal })
  if (response.status === 403 || response.status === 404) {
    throw new NoSandboxBuildError()
  }
  if (!response.ok) {
    throw new Error(`The replay sandbox build request failed with status ${response.status}`)
  }

  return { origin: STATIC_HASH_REPLAY_SANDBOX_ORIGIN, url }
}
