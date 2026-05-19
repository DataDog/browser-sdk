import { registerCleanupTask, mockClock } from '@datadog/browser-core/test'
import type { Clock } from '@datadog/browser-core/test'
import type { RumRemoteConfiguration } from './remoteConfiguration'
import { buildCacheKey, createConfigurationCache, CACHE_VERSION, CACHE_KEY_PREFIX } from './remoteConfigurationCache'

const REMOTE_CONFIGURATION_ID = 'test-id'
const CACHE_KEY = `${CACHE_KEY_PREFIX}${REMOTE_CONFIGURATION_ID}`

const VALID_CONFIG: RumRemoteConfiguration = {
  applicationId: 'app-id',
  sessionSampleRate: 50,
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

      it('should return hit with config when a valid entry exists', () => {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ version: CACHE_VERSION, config: VALID_CONFIG, fetchedAt: 1000 })
        )

        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })
        expect(cache.read()).toEqual({ status: 'hit', config: VALID_CONFIG })
      })

      it('should return error and remove entry when stored data is not valid JSON', () => {
        localStorage.setItem(CACHE_KEY, 'not-json')

        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })

        expect(cache.read()).toEqual({ status: 'error' })
        expect(localStorage.getItem(CACHE_KEY)).toBeNull()
      })

      it('should return error and remove entry when version does not match', () => {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ version: 999, config: VALID_CONFIG, fetchedAt: 1000 }))

        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })

        expect(cache.read()).toEqual({ status: 'error' })
        expect(localStorage.getItem(CACHE_KEY)).toBeNull()
      })

      it('should return error and remove entry when version is missing', () => {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ config: VALID_CONFIG, fetchedAt: 1000 }))

        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })

        expect(cache.read()).toEqual({ status: 'error' })
        expect(localStorage.getItem(CACHE_KEY)).toBeNull()
      })

      it('should return error and remove entry when config is missing', () => {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ version: CACHE_VERSION, fetchedAt: 1000 }))

        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })

        expect(cache.read()).toEqual({ status: 'error' })
        expect(localStorage.getItem(CACHE_KEY)).toBeNull()
      })

      it('should return error and remove entry when config is not an object', () => {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ version: CACHE_VERSION, config: 'not-an-object', fetchedAt: 1000 })
        )

        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })

        expect(cache.read()).toEqual({ status: 'error' })
        expect(localStorage.getItem(CACHE_KEY)).toBeNull()
      })

      it('should return error and remove entry when config is null', () => {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ version: CACHE_VERSION, config: null, fetchedAt: 1000 }))

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
          JSON.stringify({ version: CACHE_VERSION, config: VALID_CONFIG, fetchedAt: 1000 })
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

        expect(cache.read()).toEqual({ status: 'hit', config: VALID_CONFIG })
      })

      it('should serialize entry with version, config, and fetchedAt timestamp', () => {
        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })

        clock.tick(5000)
        cache.write(VALID_CONFIG)

        const stored = JSON.parse(localStorage.getItem(CACHE_KEY)!)
        expect(stored).toEqual({
          version: CACHE_VERSION,
          config: VALID_CONFIG,
          fetchedAt: clock.timeStamp(5000),
        })
      })

      it('should overwrite a previously stored entry', () => {
        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })

        cache.write({ applicationId: 'first' })
        cache.write({ applicationId: 'second' })

        expect(cache.read()).toEqual({ status: 'hit', config: { applicationId: 'second' } })
      })

      it('should silently swallow localStorage.setItem errors', () => {
        spyOn(Storage.prototype, 'setItem').and.throwError('QuotaExceededError')

        const cache = createConfigurationCache({ remoteConfigurationId: REMOTE_CONFIGURATION_ID })

        expect(() => cache.write(VALID_CONFIG)).not.toThrow()
      })
    })

    describe('remove', () => {
      it('should remove the entry from localStorage', () => {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ version: CACHE_VERSION, config: VALID_CONFIG, fetchedAt: 1000 })
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
