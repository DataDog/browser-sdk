import type { SessionState } from '@datadog/core-next'
import { MemoryStore } from './memoryStore'

const SESSION_KEY = '_DD_SESSION'

function makeState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    id: 'session-1',
    deviceId: 'device-1',
    created: 1000,
    lastActivity: 2000,
    ...overrides,
  }
}

describe('MemoryStore', () => {
  afterEach(() => {
    delete (globalThis as any)[SESSION_KEY]
  })

  it('returns undefined when nothing is stored', async () => {
    const store = new MemoryStore()

    expect(await store.get()).toBeUndefined()
  })

  it('returns stored state after set()', async () => {
    const store = new MemoryStore()
    const state = makeState()

    await store.set(state)

    expect(await store.get()).toEqual(state)
  })

  it('stores a copy, not a reference', async () => {
    const store = new MemoryStore()
    const state = makeState()

    await store.set(state)
    state.id = 'mutated'

    expect((await store.get())!.id).toBe('session-1')
  })

  it('returns undefined after clear()', async () => {
    const store = new MemoryStore()

    await store.set(makeState())
    await store.clear()

    expect(await store.get()).toBeUndefined()
  })

  it('stores state on globalThis._DD_SESSION', async () => {
    const store = new MemoryStore()
    const state = makeState()

    await store.set(state)

    expect((globalThis as any)[SESSION_KEY]).toEqual(state)
  })

  it('shares state across multiple instances', async () => {
    const storeA = new MemoryStore()
    const storeB = new MemoryStore()
    const state = makeState()

    await storeA.set(state)

    expect(await storeB.get()).toEqual(state)
  })

  it('onExternalChange returns a no-op unsubscribe function', () => {
    const store = new MemoryStore()

    const unsubscribe = store.onExternalChange(() => {})

    expect(typeof unsubscribe).toBe('function')
    expect(() => unsubscribe()).not.toThrow()
  })
})
