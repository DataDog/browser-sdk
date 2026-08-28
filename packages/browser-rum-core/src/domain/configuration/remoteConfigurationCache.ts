import { timeStampNow } from '@datadog/js-core/time'
import { generateUUID, tryJsonParse } from '@datadog/browser-core'
import { isIndexableObject } from '@datadog/js-core/util'
import type { TimeStamp } from '@datadog/js-core/time'
import type { RemoteConfiguration } from './remoteConfiguration'

export const CACHE_VERSION = 3
export const CACHE_KEY_PREFIX = 'dd_rc_'

/**
 * Sync metadata for the cached configuration version, reported on configuration telemetry to
 * measure how long a published configuration takes to take effect.
 */
export interface RemoteConfigurationMetadata {
  /** CDN publish time, from the `last-modified` response header. */
  lastModified?: number
  /** When the SDK fetched the version currently cached. */
  lastSynced: TimeStamp
  /** When this version was first applied. Stamped once, then reused on every later page load. */
  firstApplied?: TimeStamp
  /** Identifies one sync, so repeat page loads from a device collapse into a single unit. */
  syncId: string
}

interface CachedRemoteConfiguration {
  version: number
  config: RemoteConfiguration
  metadata: RemoteConfigurationMetadata
}

export type CacheReadStatus = 'hit' | 'miss' | 'error'

export type CacheReadResult =
  | {
      status: Exclude<CacheReadStatus, 'hit'>
    }
  | {
      status: Extract<CacheReadStatus, 'hit'>
      config: RemoteConfiguration
      metadata: RemoteConfigurationMetadata
    }

export const CACHE_STATUS_TO_METRIC_MAP: Record<CacheReadStatus, 'success' | 'missing' | 'failure'> = {
  hit: 'success',
  miss: 'missing',
  error: 'failure',
}

export function buildCacheKey(remoteConfigurationId: string): string {
  return `${CACHE_KEY_PREFIX}${remoteConfigurationId}`
}

function isValidCacheEntry(value: unknown): value is CachedRemoteConfiguration {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const hasVersion = 'version' in value && value.version === CACHE_VERSION
  const hasConfig = 'config' in value && typeof value.config === 'object' && value.config !== null
  const hasMetadata =
    'metadata' in value &&
    isIndexableObject(value.metadata) &&
    typeof value.metadata.syncId === 'string' &&
    typeof value.metadata.lastSynced === 'number'

  return hasVersion && hasConfig && hasMetadata
}

function persist(key: string, entry: CachedRemoteConfiguration) {
  try {
    localStorage.setItem(key, JSON.stringify(entry))
  } catch {
    // Ignore
  }
}

export function createConfigurationCache({ remoteConfigurationId }: { remoteConfigurationId: string }) {
  const key = buildCacheKey(remoteConfigurationId)

  return {
    read(): CacheReadResult {
      let raw: string | null

      try {
        raw = localStorage.getItem(key)
      } catch {
        return { status: 'error' }
      }

      if (raw === null) {
        return { status: 'miss' }
      }

      const parsed = tryJsonParse(raw)
      if (parsed === undefined) {
        this.remove()

        return { status: 'error' }
      }

      if (!isValidCacheEntry(parsed)) {
        this.remove()

        return { status: 'error' }
      }

      return { status: 'hit', config: parsed.config, metadata: parsed.metadata }
    },
    remove() {
      try {
        localStorage.removeItem(key)
      } catch {
        // Ignore
      }
    },
    write(config: RemoteConfiguration, lastModified?: number) {
      const cached = this.read()

      // Only a payload change counts as a sync. The SDK sends no `If-None-Match`, so it never
      // observes a 304 and cannot otherwise tell a genuine sync from a repeated fetch of the same
      // version. Skipping the write here is also what keeps `firstApplied` alive across refetches.
      // TODO: compare on `ETag` instead once the CDN exposes it through
      // `Access-Control-Expose-Headers`. The stringify compare is key-order sensitive, which holds
      // only because both sides come from `JSON.parse` of the same CDN payload.
      if (cached.status === 'hit' && JSON.stringify(cached.config) === JSON.stringify(config)) {
        return
      }

      persist(key, {
        version: CACHE_VERSION,
        config,
        metadata: { lastModified, lastSynced: timeStampNow(), syncId: generateUUID() },
      })
    },
  }
}
