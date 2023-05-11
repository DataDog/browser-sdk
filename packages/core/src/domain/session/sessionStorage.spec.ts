import type { SessionState } from './sessionStorage'
import { isSessionInExpiredState } from './sessionStorage'

describe('session storage utilities', () => {
  const EXPIRED_SESSION: SessionState = {}
  const LIVE_SESSION: SessionState = { created: '0', id: '123' }

  it('should correctly identify a session in expired state', () => {
    expect(isSessionInExpiredState(EXPIRED_SESSION)).toBe(true)
  })

  it('should correctly identify a session in live state', () => {
    expect(isSessionInExpiredState(LIVE_SESSION)).toBe(false)
  })
})
