import { registerCleanupTask } from '../../../../test'
import { getGlobalObject } from '../../../tools/globalObject'
import type { Configuration } from '../../configuration'
import type { SessionState } from '../sessionState'
import { initMemorySessionStoreStrategy, MEMORY_SESSION_STORE_KEY } from './sessionInMemory'

describe('session in memory strategy', () => {
  const DEFAULT_INIT_CONFIGURATION = { trackAnonymousUser: true } as Configuration
  const sessionState: SessionState = { id: '123', created: '0' }

  beforeEach(() => {
    registerCleanupTask(() => {
      const globalObject = getGlobalObject<Record<string, unknown>>()
      delete globalObject[MEMORY_SESSION_STORE_KEY]
    })
  })

  it('should persist a session in memory', async () => {
    const memoryStorageStrategy = initMemorySessionStoreStrategy(DEFAULT_INIT_CONFIGURATION)
    await memoryStorageStrategy.persistSession(sessionState)
    const session = await memoryStorageStrategy.retrieveSession()
    expect(session).toEqual(sessionState)
    expect(session).not.toBe(sessionState)
  })

  it('should set `isExpired=1` on session', async () => {
    const memoryStorageStrategy = initMemorySessionStoreStrategy(DEFAULT_INIT_CONFIGURATION)
    await memoryStorageStrategy.persistSession(sessionState)
    await memoryStorageStrategy.expireSession(sessionState)
    const session = await memoryStorageStrategy.retrieveSession()
    expect(session).toEqual({ isExpired: '1' })
    expect(session).not.toBe(sessionState)
  })

  it('should return an empty object when no state persisted', async () => {
    const memoryStorageStrategy = initMemorySessionStoreStrategy(DEFAULT_INIT_CONFIGURATION)
    const session = await memoryStorageStrategy.retrieveSession()
    expect(session).toEqual({})
  })

  it('should not mutate stored session if source state mutates', async () => {
    const sessionStateToMutate: SessionState = {}
    const memoryStorageStrategy = initMemorySessionStoreStrategy(DEFAULT_INIT_CONFIGURATION)
    await memoryStorageStrategy.persistSession(sessionStateToMutate)
    sessionStateToMutate.id = '123'
    const session = await memoryStorageStrategy.retrieveSession()
    expect(session).toEqual({})
    expect(session).not.toBe(sessionStateToMutate)
  })

  it('should share session state between multiple strategy instances (RUM and Logs)', async () => {
    const rumStrategy = initMemorySessionStoreStrategy(DEFAULT_INIT_CONFIGURATION)
    const logsStrategy = initMemorySessionStoreStrategy(DEFAULT_INIT_CONFIGURATION)

    await rumStrategy.persistSession(sessionState)

    const logsSession = await logsStrategy.retrieveSession()
    expect(logsSession).toEqual(sessionState)
  })

  it('should reflect updates from one SDK instance in another', async () => {
    const rumStrategy = initMemorySessionStoreStrategy(DEFAULT_INIT_CONFIGURATION)
    const logsStrategy = initMemorySessionStoreStrategy(DEFAULT_INIT_CONFIGURATION)

    await rumStrategy.persistSession({ id: '123', created: '0' })
    await logsStrategy.persistSession({ id: '123', created: '0', rum: '1' })

    const rumSession = await rumStrategy.retrieveSession()
    expect(rumSession.rum).toEqual('1')
  })

  it('should store session in global object', async () => {
    const memoryStorageStrategy = initMemorySessionStoreStrategy(DEFAULT_INIT_CONFIGURATION)
    await memoryStorageStrategy.persistSession(sessionState)

    const globalObject = getGlobalObject<Record<string, unknown>>()
    expect(globalObject[MEMORY_SESSION_STORE_KEY]).toEqual(sessionState)
  })
})
