import { registerCleanupTask } from '../../../../test'
import { getGlobalObject } from '../../../tools/globalObject'
import type { Configuration } from '../../configuration'
import type { SessionState } from '../sessionState'
import { initInMemorySessionStoreStrategy, IN_MEMORY_SESSION_STORE_KEY } from './sessionInMemory'

describe('session in memory strategy', () => {
  const DEFAULT_INIT_CONFIGURATION = { trackAnonymousUser: true } as Configuration
  const sessionState: SessionState = { id: '123', created: '0' }

  beforeEach(() => {
    registerCleanupTask(() => {
      const globalObject = getGlobalObject<Record<string, unknown>>()
      delete globalObject[IN_MEMORY_SESSION_STORE_KEY]
    })
  })

  it('should persist a session in memory', () => {
    const inMemoryStorageStrategy = initInMemorySessionStoreStrategy(DEFAULT_INIT_CONFIGURATION)
    inMemoryStorageStrategy.persistSession(sessionState)
    const session = inMemoryStorageStrategy.retrieveSession()
    expect(session).toEqual(sessionState)
    expect(session).not.toBe(sessionState)
  })

  it('should set `isExpired=1` on session', () => {
    const inMemoryStorageStrategy = initInMemorySessionStoreStrategy(DEFAULT_INIT_CONFIGURATION)
    inMemoryStorageStrategy.persistSession(sessionState)
    inMemoryStorageStrategy.expireSession(sessionState)
    const session = inMemoryStorageStrategy.retrieveSession()
    expect(session).toEqual({ isExpired: '1' })
    expect(session).not.toBe(sessionState)
  })

  it('should return an empty object when no state persisted', () => {
    const inMemoryStorageStrategy = initInMemorySessionStoreStrategy(DEFAULT_INIT_CONFIGURATION)
    const session = inMemoryStorageStrategy.retrieveSession()
    expect(session).toEqual({})
  })

  it('should not mutate stored session if source state mutates', () => {
    const sessionStateToMutate: SessionState = {}
    const inMemoryStorageStrategy = initInMemorySessionStoreStrategy(DEFAULT_INIT_CONFIGURATION)
    inMemoryStorageStrategy.persistSession(sessionStateToMutate)
    sessionStateToMutate.id = '123'
    const session = inMemoryStorageStrategy.retrieveSession()
    expect(session).toEqual({})
    expect(session).not.toBe(sessionStateToMutate)
  })

  it('should share session state between multiple strategy instances (RUM and Logs)', () => {
    const rumStrategy = initInMemorySessionStoreStrategy(DEFAULT_INIT_CONFIGURATION)
    const logsStrategy = initInMemorySessionStoreStrategy(DEFAULT_INIT_CONFIGURATION)

    rumStrategy.persistSession(sessionState)

    const logsSession = logsStrategy.retrieveSession()
    expect(logsSession).toEqual(sessionState)
  })

  it('should reflect updates from one SDK instance in another', () => {
    const rumStrategy = initInMemorySessionStoreStrategy(DEFAULT_INIT_CONFIGURATION)
    const logsStrategy = initInMemorySessionStoreStrategy(DEFAULT_INIT_CONFIGURATION)

    rumStrategy.persistSession({ id: '123', created: '0' })
    logsStrategy.persistSession({ id: '123', created: '0', rum: '1' })

    const rumSession = rumStrategy.retrieveSession()
    expect(rumSession.rum).toEqual('1')
  })

  it('should store session in global object', () => {
    const inMemoryStorageStrategy = initInMemorySessionStoreStrategy(DEFAULT_INIT_CONFIGURATION)
    inMemoryStorageStrategy.persistSession(sessionState)

    const globalObject = getGlobalObject<Record<string, unknown>>()
    expect(globalObject[IN_MEMORY_SESSION_STORE_KEY]).toEqual(sessionState)
  })
})
