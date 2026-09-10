import { registerCleanupTask, mockClock } from '@datadog/browser-core/test'
import type { Clock } from '@datadog/browser-core/test'
import type { TimeStamp } from '@datadog/js-core/time'
import type { RemoteConfiguration } from './remoteConfiguration'
import {
  buildCacheKey,
  createConfigurationCache,
  CACHE_VERSION,
  CACHE_KEY_PREFIX,
  type RemoteConfigurationMetadata,
} from './remoteConfigurationCache'

const REMOTE_CONFIGURATION_ID = 'test-id'
const CACHE_KEY = `${CACHE_KEY_PREFIX}${REMOTE_CONFIGURATION_ID}`

const VALID_CONFIG: RemoteConfiguration = {
  rum: {
    applicationId: 'app-id',
    sessionSampleRate: 50,
  },
}

const VALID_METADATA: RemoteConfigurationMetadata = {
  lastSynced: 1000 as TimeStamp,
  syncId: 'sync-id',
}

function readHit(cache: ReturnType<typeof createConfigurationCache>) {
  const result = cache.read()
  if (result.status !== 'hit') {
    throw new Error(`expected a cache hit, got '${result.status}'`)
  }

  return result
}

describe('remoteConfigurationCache', () => {
  beforeEach(() => {
    registerCleanupTask(() => {
      localStorage.clear()
    })
  })

  describe('createConfigurationCache', () => {
    describe('read', () => {
      it('should return miss when no entry exists', () => {
        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })
        expect(cache.read()).toEqual({ status: 'miss' })
      })

      it('should return hit with config and metadata when a valid entry exists', () => {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ version: CACHE_VERSION, config: VALID_CONFIG, metadata: VALID_METADATA })
        )

        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })
        expect(cache.read()).toEqual({ status: 'hit', config: VALID_CONFIG, metadata: VALID_METADATA })
      })

      it('should return error and remove entry when stored data is not valid JSON', () => {
        localStorage.setItem(CACHE_KEY, 'not-json')

        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })

        expect(cache.read()).toEqual({ status: 'error' })
        expect(localStorage.getItem(CACHE_KEY)).toBeNull()
      })

      it('should return error and remove entry when version does not match', () => {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ version: 999, config: VALID_CONFIG, metadata: VALID_METADATA })
        )

        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })

        expect(cache.read()).toEqual({ status: 'error' })
        expect(localStorage.getItem(CACHE_KEY)).toBeNull()
      })

      it('should return error and remove entry when version is missing', () => {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ config: VALID_CONFIG, metadata: VALID_METADATA }))

        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })

        expect(cache.read()).toEqual({ status: 'error' })
        expect(localStorage.getItem(CACHE_KEY)).toBeNull()
      })

      it('should return error and remove entry when config is missing', () => {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ version: CACHE_VERSION, metadata: VALID_METADATA }))

        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })

        expect(cache.read()).toEqual({ status: 'error' })
        expect(localStorage.getItem(CACHE_KEY)).toBeNull()
      })

      it('should return error and remove entry when config is not an object', () => {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ version: CACHE_VERSION, config: 'not-an-object', metadata: VALID_METADATA })
        )

        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })

        expect(cache.read()).toEqual({ status: 'error' })
        expect(localStorage.getItem(CACHE_KEY)).toBeNull()
      })

      it('should return error and remove entry when config is null', () => {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ version: CACHE_VERSION, config: null, metadata: VALID_METADATA })
        )

        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })

        expect(cache.read()).toEqual({ status: 'error' })
        expect(localStorage.getItem(CACHE_KEY)).toBeNull()
      })

      it('should return error and remove entry when metadata is missing', () => {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ version: CACHE_VERSION, config: VALID_CONFIG }))

        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })

        expect(cache.read()).toEqual({ status: 'error' })
        expect(localStorage.getItem(CACHE_KEY)).toBeNull()
      })

      it('should return error and remove entry when metadata lacks a syncId', () => {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ version: CACHE_VERSION, config: VALID_CONFIG, metadata: { lastSynced: 1000 } })
        )

        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })

        expect(cache.read()).toEqual({ status: 'error' })
        expect(localStorage.getItem(CACHE_KEY)).toBeNull()
      })

      it('should return error when localStorage.getItem throws', () => {
        spyOn(Storage.prototype, 'getItem').and.throwError('SecurityError')

        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })

        expect(cache.read()).toEqual({ status: 'error' })
      })

      it('should isolate caches by remoteConfigurationId', () => {
        localStorage.setItem(
          buildCacheKey('id-A'),
          JSON.stringify({ version: CACHE_VERSION, config: VALID_CONFIG, metadata: VALID_METADATA })
        )

        const cacheB = createConfigurationCache({ remoteConfigurationId: 'id-B' })
        expect(cacheB.read()).toEqual({ status: 'miss' })
      })
    })

    describe('write', () => {
      let clock: Clock

      beforeEach(() => {
        clock = mockClock()
      })

      it('should persist a config that can be read back', () => {
        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })

        cache.write(VALID_CONFIG)

        expect(cache.read()).toEqual({
          status: 'hit',
          config: VALID_CONFIG,
          metadata: { lastSynced: clock.timeStamp(0), syncId: jasmine.any(String) as unknown as string },
        })
      })

      it('should serialize entry with version, config, and sync metadata', () => {
        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })

        clock.tick(5000)
        cache.write(VALID_CONFIG, 1500)

        const stored = JSON.parse(localStorage.getItem(CACHE_KEY)!)
        expect(stored).toEqual({
          version: CACHE_VERSION,
          config: VALID_CONFIG,
          metadata: {
            lastModified: 1500,
            lastSynced: clock.timeStamp(5000),
            syncId: jasmine.any(String) as unknown as string,
          },
        })
      })

      it('should overwrite a previously stored entry', () => {
        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })

        cache.write({ rum: { applicationId: 'first' } })
        cache.write({ rum: { applicationId: 'second' } })

        expect(readHit(cache).config).toEqual({ rum: { applicationId: 'second' } })
      })

      it('should regenerate sync metadata when the config changed', () => {
        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })

        cache.write({ rum: { applicationId: 'first' } }, 1500)
        const first = readHit(cache).metadata

        clock.tick(5000)
        cache.write({ rum: { applicationId: 'second' } }, 2500)

        const second = readHit(cache).metadata
        expect(second.syncId).not.toBe(first.syncId)
        expect(second.lastSynced).toEqual(clock.timeStamp(5000))
        expect(second.lastModified).toBe(2500)
      })

      it('should not rewrite sync metadata when the config is unchanged', () => {
        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })

        cache.write(VALID_CONFIG, 1500)
        const first = readHit(cache).metadata

        clock.tick(5000)
        cache.write(VALID_CONFIG, 2500)

        expect(readHit(cache).metadata).toEqual(first)
      })

      it('should silently swallow localStorage.setItem errors', () => {
        spyOn(Storage.prototype, 'setItem').and.throwError('QuotaExceededError')

        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })

        expect(() => cache.write(VALID_CONFIG)).not.toThrow()
      })
    })

    describe('stampFirstApplied', () => {
      let clock: Clock

      beforeEach(() => {
        clock = mockClock()
      })

      it('should stamp firstApplied and persist it when unset', () => {
        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })
        cache.write(VALID_CONFIG)

        clock.tick(5000)
        const metadata = cache.stampFirstApplied(readHit(cache))

        expect(metadata.firstApplied).toEqual(clock.timeStamp(5000))
        expect(readHit(cache).metadata.firstApplied).toEqual(clock.timeStamp(5000))
        expect(readHit(cache).config).toEqual(VALID_CONFIG)
      })

      it('should reuse the firstApplied already stamped', () => {
        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })
        cache.write(VALID_CONFIG)
        const first = cache.stampFirstApplied(readHit(cache))

        clock.tick(60000)
        const second = cache.stampFirstApplied(readHit(cache))

        expect(second.firstApplied).toEqual(first.firstApplied)
      })

      it('should preserve firstApplied when an unchanged config is refetched', () => {
        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })
        cache.write(VALID_CONFIG)
        const stamped = cache.stampFirstApplied(readHit(cache))

        clock.tick(5000)
        cache.write(VALID_CONFIG)

        expect(readHit(cache).metadata.firstApplied).toEqual(stamped.firstApplied)
      })

      it('should leave firstApplied unset when the config changed', () => {
        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })
        cache.write({ rum: { applicationId: 'first' } })
        cache.stampFirstApplied(readHit(cache))

        cache.write({ rum: { applicationId: 'second' } })

        expect(readHit(cache).metadata.firstApplied).toBeUndefined()
      })

      it('should keep the rest of the metadata intact when stamping', () => {
        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })
        cache.write(VALID_CONFIG, 1500)
        const before = readHit(cache).metadata

        const after = cache.stampFirstApplied(readHit(cache))

        expect(after.lastModified).toBe(1500)
        expect(after.lastSynced).toEqual(before.lastSynced)
        expect(after.syncId).toBe(before.syncId)
      })
    })

    describe('remove', () => {
      it('should remove the entry from localStorage', () => {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ version: CACHE_VERSION, config: VALID_CONFIG, metadata: VALID_METADATA })
        )

        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })
        cache.remove()

        expect(localStorage.getItem(CACHE_KEY)).toBeNull()
      })

      it('should silently swallow localStorage.removeItem errors', () => {
        spyOn(Storage.prototype, 'removeItem').and.throwError('SecurityError')

        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })

        expect(() => cache.remove()).not.toThrow()
      })
    })
  })
})
