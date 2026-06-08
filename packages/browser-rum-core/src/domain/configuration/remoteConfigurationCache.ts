import { timeStampNow } from '@datadog/js-core/time'
import type { TimeStamp } from '@datadog/js-core/time'
import type { RumRemoteConfiguration } from './remoteConfiguration'

export const CACHE_VERSION = 1
export const CACHE_KEY_PREFIX = 'dd_rc_'

interface CachedRemoteConfiguration {
  version: number
  config: RumRemoteConfiguration
  fetchedAt: TimeStamp
}

export type CacheReadStatus = 'hit' | 'miss' | 'error'

export type CacheReadResult =
  | {
      status: Exclude<CacheReadStatus, 'hit'>
    }
  | { status: Extract<CacheReadStatus, 'hit'>; config: RumRemoteConfiguration }

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

  return hasVersion && hasConfig
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

      let parsed: unknown

      try {
        parsed = JSON.parse(raw)
      } catch {
        this.remove()

        return { status: 'error' }
      }

      if (!isValidCacheEntry(parsed)) {
        this.remove()

        return { status: 'error' }
      }

      return { status: 'hit', config: parsed.config }
    },
    remove() {
      try {
        localStorage.removeItem(key)
      } catch {
        // Ignore
      }
    },
    write(config: RumRemoteConfiguration) {
      const entry: CachedRemoteConfiguration = {
        version: CACHE_VERSION,
        config,
        fetchedAt: timeStampNow(),
      }

      try {
        localStorage.setItem(key, JSON.stringify(entry))
      } catch {
        // Ignore
      }
    },
  }
}
