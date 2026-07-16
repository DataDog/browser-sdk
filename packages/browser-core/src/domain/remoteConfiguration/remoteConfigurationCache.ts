import { timeStampNow } from '@datadog/js-core/time'
import { tryJsonParse } from '../../tools/utils/objectUtils'
import type { TimeStamp } from '@datadog/js-core/time'

export const CACHE_VERSION = 2
export const CACHE_KEY_PREFIX = 'dd_rc_'

interface CachedRemoteConfiguration<T> {
  version: number
  config: T
  fetchedAt: TimeStamp
}

export type CacheReadStatus = 'hit' | 'miss' | 'error'

export type CacheReadResult<T> =
  | {
      status: Exclude<CacheReadStatus, 'hit'>
    }
  | { status: Extract<CacheReadStatus, 'hit'>; config: T }

export const CACHE_STATUS_TO_METRIC_MAP: Record<CacheReadStatus, 'success' | 'missing' | 'failure'> = {
  hit: 'success',
  miss: 'missing',
  error: 'failure',
}

export function buildCacheKey(remoteConfigurationId: string): string {
  return `${CACHE_KEY_PREFIX}${remoteConfigurationId}`
}

function isValidCacheEntry(value: unknown): value is CachedRemoteConfiguration<unknown> {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const hasVersion = 'version' in value && value.version === CACHE_VERSION
  const hasConfig = 'config' in value && typeof value.config === 'object' && value.config !== null

  return hasVersion && hasConfig
}

export function createConfigurationCache<T>({ remoteConfigurationId }: { remoteConfigurationId: string }) {
  const key = buildCacheKey(remoteConfigurationId)

  return {
    read(): CacheReadResult<T> {
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

      return { status: 'hit', config: parsed.config as T }
    },
    remove() {
      try {
        localStorage.removeItem(key)
      } catch {
        // Ignore
      }
    },
    write(config: T) {
      const entry: CachedRemoteConfiguration<T> = {
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
