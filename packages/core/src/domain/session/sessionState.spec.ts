import { dateNow } from '../../tools/utils/timeUtils'
import { SESSION_EXPIRATION_DELAY } from './sessionConstants'
import type { SessionState } from './sessionState'
import {
  expandSessionState,
  isSessionInExpiredState,
  toSessionString,
  toSessionState,
  isSessionInitialized,
} from './sessionState'

describe('session state utilities', () => {
  const EXPIRED_SESSION: SessionState = { id: 'null' }
  const SERIALIZED_EXPIRED_SESSION = 'id=null'
  const LIVE_SESSION: SessionState = { created: '0', id: '123' }
  const SERIALIZED_LIVE_SESSION = 'created=0&id=123'

  describe('isSessionInitialized', () => {
    it('should correctly identify a session in initialized state', () => {
      expect(isSessionInitialized({ id: '123' })).toBe(true)
      expect(isSessionInitialized({ id: 'null' })).toBe(true)
      expect(isSessionInitialized({} as SessionState)).toBe(false)
    })
  })

  describe('isSessionInExpiredState', () => {
    it('should correctly identify a session in expired state', () => {
      expect(isSessionInExpiredState(EXPIRED_SESSION)).toBe(true)
    })

    it('should correctly identify a session in live state', () => {
      expect(isSessionInExpiredState(LIVE_SESSION)).toBe(false)
    })
  })

  describe('toSessionString', () => {
    it('should serialize a sessionState to a string', () => {
      expect(toSessionString(LIVE_SESSION)).toEqual(SERIALIZED_LIVE_SESSION)
    })

    it('should handle empty sessionStates', () => {
      expect(toSessionString(EXPIRED_SESSION)).toEqual(SERIALIZED_EXPIRED_SESSION)
    })
  })

  describe('sessionStringToSessionState', () => {
    it('should deserialize a session string to a sessionState', () => {
      expect(toSessionState(SERIALIZED_LIVE_SESSION)).toEqual(LIVE_SESSION)
    })

    it('should handle empty session strings', () => {
      expect(toSessionState(SERIALIZED_EXPIRED_SESSION)).toEqual(EXPIRED_SESSION)
    })

    it('should handle invalid session strings', () => {
      const sessionString = '{invalid: true}'
      expect(toSessionState(sessionString)).toEqual({})
    })
  })

  describe('expandSessionState', () => {
    it('should modify the expire property of the session', () => {
      const session = { ...LIVE_SESSION }
      const now = dateNow()
      expandSessionState(session)
      expect(session.expire).toBeGreaterThanOrEqual(now + SESSION_EXPIRATION_DELAY)
    })
  })
})
