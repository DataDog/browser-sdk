import { dateNow } from '../../tools/utils/timeUtils'
import { SESSION_EXPIRATION_DELAY } from './sessionConstants'
import type { SessionState } from './sessionState'
import {
  expandSessionState,
  isSessionInExpiredState,
  toSessionString,
  toSessionState,
  isSessionInNotStartedState,
} from './sessionState'

describe('session state utilities', () => {
  const NOT_STARTED_SESSION: SessionState = {}
  const SERIALIZED_NOT_STARTED_SESSION = ''
  const EXPIRED_SESSION: SessionState = { isExpired: '1' }
  const SERIALIZED_EXPIRED_SESSION = 'isExpired=1'
  const LIVE_SESSION: SessionState = { id: '123', first: 'tracked' }
  const SERIALIZED_LIVE_SESSION = 'id=123&first=tracked'

  describe('isSessionStarted', () => {
    it('should correctly identify a session in a started state', () => {
      expect(isSessionInNotStartedState(LIVE_SESSION)).toBe(false)
      expect(isSessionInNotStartedState(EXPIRED_SESSION)).toBe(false)
    })

    it('should correctly identify a session in a not started state', () => {
      expect(isSessionInNotStartedState(NOT_STARTED_SESSION)).toBe(true)
    })
  })

  describe('isSessionInExpiredState', () => {
    function dateNowWithOffset(offset = 0) {
      return String(dateNow() + offset)
    }

    it('should correctly identify a session in expired state', () => {
      expect(isSessionInExpiredState(EXPIRED_SESSION)).toBe(true)
      expect(isSessionInExpiredState({ created: dateNowWithOffset(-1000 * 60 * 60 * 4) })).toBe(true)
      expect(isSessionInExpiredState({ expire: dateNowWithOffset(-100) })).toBe(true)
    })

    it('should correctly identify a session in live state', () => {
      expect(isSessionInExpiredState({ created: dateNowWithOffset(-1000), expire: dateNowWithOffset(1000) })).toBe(
        false
      )
      expect(isSessionInExpiredState({ first: 'not-tracked' })).toBe(false)
      expect(isSessionInExpiredState({ first: 'tracked' })).toBe(false)
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
      expect(toSessionState(SERIALIZED_NOT_STARTED_SESSION)).toEqual(NOT_STARTED_SESSION)
    })

    it('should handle expired session', () => {
      expect(toSessionState(SERIALIZED_EXPIRED_SESSION)).toEqual(EXPIRED_SESSION)
    })

    it('should handle invalid session strings', () => {
      const sessionString = '{invalid: true}'
      expect(toSessionState(sessionString)).toEqual(NOT_STARTED_SESSION)
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
