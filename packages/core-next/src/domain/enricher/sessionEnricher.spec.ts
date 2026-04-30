import type { Session } from '../session/session'
import { sessionEnricher } from './sessionEnricher'
import { DISCARD } from './factory'

function stubSession(id: string | undefined): Session {
  return {
    getId: () => id,
    getDeviceId: () => 'device-1',
    isExpired: () => id === undefined,
    touch: async () => {},
    expire: async () => {},
    renew: async () => {},
    on: () => {},
  } as unknown as Session
}

describe('sessionEnricher', () => {
  it('should add session.id and session.type to the event', () => {
    const enricher = sessionEnricher(stubSession('session-123'))

    const result = enricher.transform({ message: 'test' })

    expect(result).toEqual({ message: 'test', session: { id: 'session-123', type: 'user', is_active: true } })
  })

  it('should discard events when session is expired', () => {
    const enricher = sessionEnricher(stubSession(undefined))

    const result = enricher.transform({ message: 'test' })

    expect(result).toBe(DISCARD)
  })

  it('should preserve existing event fields', () => {
    const enricher = sessionEnricher(stubSession('abc'))

    const result = enricher.transform({ message: 'test', status: 'info', origin: 'logger' })

    expect(result).toEqual({ message: 'test', status: 'info', origin: 'logger', session: { id: 'abc', type: 'user', is_active: true } })
  })

  it('should set session.type to user', () => {
    const enricher = sessionEnricher(stubSession('abc'))

    const result = enricher.transform({}) as Record<string, unknown>

    expect((result.session as Record<string, unknown>).type).toBe('user')
  })

  it('should have name "session"', () => {
    const enricher = sessionEnricher(stubSession('abc'))

    expect(enricher.name).toBe('session')
  })
})
