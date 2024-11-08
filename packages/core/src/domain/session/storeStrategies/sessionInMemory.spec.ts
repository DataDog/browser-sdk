import type { SessionState } from '../sessionState'
import { initInMemorySessionStoreStrategy } from './sessionInMemory'

describe('session in memory strategy', () => {
  const sessionState: SessionState = { id: '123', created: '0' }

  afterEach(() => {
    const inMemoryStorageStrategy = initInMemorySessionStoreStrategy()
    inMemoryStorageStrategy.persistSession({})
  })

  it('should persist a session in memory', () => {
    const inMemoryStorageStrategy = initInMemorySessionStoreStrategy()
    inMemoryStorageStrategy.persistSession(sessionState)
    const session = inMemoryStorageStrategy.retrieveSession()
    expect(session).toEqual(sessionState)
    expect(session).not.toBe(sessionState)
  })

  it('should set `isExpired=1` on session', () => {
    const inMemoryStorageStrategy = initInMemorySessionStoreStrategy()
    inMemoryStorageStrategy.persistSession(sessionState)
    inMemoryStorageStrategy.expireSession()
    const session = inMemoryStorageStrategy.retrieveSession()
    expect(session).toEqual({ isExpired: '1' })
    expect(session).not.toBe(sessionState)
  })

  it('should return an empty object when no state persisted', () => {
    const inMemoryStorageStrategy = initInMemorySessionStoreStrategy()
    const session = inMemoryStorageStrategy.retrieveSession()
    expect(session).toEqual({})
  })

  it('should not mutate stored session if source state mutates', () => {
    const sessionStateToMutate: SessionState = {}
    const inMemoryStorageStrategy = initInMemorySessionStoreStrategy()
    inMemoryStorageStrategy.persistSession(sessionStateToMutate)
    sessionStateToMutate.id = '123'
    const session = inMemoryStorageStrategy.retrieveSession()
    expect(session).toEqual({})
    expect(session).not.toBe(sessionStateToMutate)
  })
})
