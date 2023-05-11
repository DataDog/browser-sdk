import type { SessionState } from './sessionStore'
import { isSessionInExpiredState, toSessionString, sessionStringToSessionState } from './sessionStore'

describe('session store utilities', () => {
  const EXPIRED_SESSION: SessionState = {}
  const SERIALIZED_EXPIRED_SESSION = ''
  const LIVE_SESSION: SessionState = { created: '0', id: '123' }
  const SERIALIZED_LIVE_SESSION = 'created=0&id=123'

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
      expect(sessionStringToSessionState(SERIALIZED_LIVE_SESSION)).toEqual(LIVE_SESSION)
    })

    it('should handle empty session strings', () => {
      expect(sessionStringToSessionState(SERIALIZED_EXPIRED_SESSION)).toEqual(EXPIRED_SESSION)
    })

    it('should handle invalid session strings', () => {
      const sessionString = '{invalid: true}'
      expect(sessionStringToSessionState(sessionString)).toEqual(EXPIRED_SESSION)
    })
  })
})
