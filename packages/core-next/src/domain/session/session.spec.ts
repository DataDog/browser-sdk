/* eslint-disable @typescript-eslint/unbound-method */
import { ONE_HOUR, ONE_MINUTE } from '../time'
import { Session } from './session'
import type { SessionOptions, SessionState, SessionStore } from './session'

const SESSION_MAX_AGE = 4 * ONE_HOUR
const SESSION_INACTIVITY_TIMEOUT = 15 * ONE_MINUTE

function stubStore(initial?: SessionState): SessionStore & {
  state: SessionState | undefined
  triggerExternalChange: () => void
} {
  let externalCallback: (() => void) | undefined
  const stub = {
    state: initial,
    get: async () => stub.state,
    set: async (state: SessionState) => {
      stub.state = state
    },
    clear: async () => {
      stub.state = undefined
    },
    onExternalChange: (callback: () => void) => {
      externalCallback = callback
      return () => {
        externalCallback = undefined
      }
    },
    triggerExternalChange: () => {
      externalCallback?.()
    },
  }
  return stub
}

async function createSession(overrides: Partial<SessionOptions> = {}) {
  let currentTime = 0
  let idCounter = 0
  const now = overrides.now ?? (() => currentTime)
  const generateId = overrides.generateId ?? (() => `id-${idCounter++}`)
  const store = (overrides.store as ReturnType<typeof stubStore>) ?? stubStore()

  const session = await Session.create({ store, generateId, now })

  return {
    session,
    store,
    advance(ms: number) {
      currentTime += ms
    },
  }
}

describe('Session', () => {
  describe('identity', () => {
    it('should generate a session ID on creation when store is empty', async () => {
      const { session } = await createSession()

      expect(session.getId()).toBe('id-0')
    })

    it('should restore session ID from store', async () => {
      const store = stubStore({ id: 'existing-id', deviceId: 'device-1', created: 0, lastActivity: 0 })
      const { session } = await createSession({ store })

      expect(session.getId()).toBe('existing-id')
    })

    it('should generate a device ID on creation when store is empty', async () => {
      const { session } = await createSession()

      expect(session.getDeviceId()).toBe('id-1')
    })

    it('should restore device ID from store', async () => {
      const store = stubStore({ id: 'session-1', deviceId: 'device-1', created: 0, lastActivity: 0 })
      const { session } = await createSession({ store })

      expect(session.getDeviceId()).toBe('device-1')
    })

    it('should persist session state to store on creation', async () => {
      const { session, store } = await createSession()

      expect(store.state).toBeDefined()
      expect(store.state!.id).toBe(session.getId()!)
      expect(store.state!.deviceId).toBe(session.getDeviceId())
    })
  })

  describe('expiry', () => {
    it('should not be expired when just created', async () => {
      const { session } = await createSession()

      expect(session.isExpired()).toBe(false)
    })

    it('should expire after max age', async () => {
      const { session, advance } = await createSession()

      advance(SESSION_MAX_AGE + 1)

      expect(session.isExpired()).toBe(true)
    })

    it('should expire after inactivity timeout', async () => {
      const { session, advance } = await createSession()

      advance(SESSION_INACTIVITY_TIMEOUT + 1)

      expect(session.isExpired()).toBe(true)
    })

    it('should not expire if activity is reported within timeout', async () => {
      const { session, advance } = await createSession()

      advance(SESSION_INACTIVITY_TIMEOUT - 1)
      await session.touch()
      advance(SESSION_INACTIVITY_TIMEOUT - 1)

      expect(session.isExpired()).toBe(false)
    })

    it('should expire even with activity after max age', async () => {
      const { session, advance } = await createSession()

      for (let i = 0; i < 20; i++) {
        advance(SESSION_MAX_AGE / 20)
        await session.touch()
      }
      advance(1)

      expect(session.isExpired()).toBe(true)
    })

    it('should return undefined ID when expired', async () => {
      const { session, advance } = await createSession()

      advance(SESSION_MAX_AGE + 1)

      expect(session.getId()).toBeUndefined()
    })

    it('should force expire when expire() is called', async () => {
      const { session } = await createSession()

      await session.expire()

      expect(session.isExpired()).toBe(true)
    })
  })

  describe('renewal', () => {
    it('should generate a new session ID on renew', async () => {
      const { session } = await createSession()
      const firstId = session.getId()

      await session.renew()

      expect(session.getId()).toBeDefined()
      expect(session.getId()).not.toBe(firstId)
    })

    it('should keep the same device ID on renew', async () => {
      const { session } = await createSession()
      const deviceId = session.getDeviceId()

      await session.renew()

      expect(session.getDeviceId()).toBe(deviceId)
    })

    it('should not be expired after renew', async () => {
      const { session, advance } = await createSession()
      advance(SESSION_MAX_AGE + 1)

      await session.renew()

      expect(session.isExpired()).toBe(false)
    })

    it('should persist renewed state to store', async () => {
      const { session, store } = await createSession()

      await session.renew()

      expect(store.state!.id).toBe(session.getId()!)
    })
  })

  describe('signals', () => {
    it('should emit expired when session expires via expire()', async () => {
      const { session } = await createSession()
      const expiredSpy = jasmine.createSpy('expired')
      session.on('expired', expiredSpy)

      await session.expire()

      expect(expiredSpy).toHaveBeenCalledTimes(1)
    })

    it('should emit renewed when session is renewed', async () => {
      const { session } = await createSession()
      const renewedSpy = jasmine.createSpy('renewed')
      session.on('renewed', renewedSpy)

      await session.renew()

      expect(renewedSpy).toHaveBeenCalledTimes(1)
    })

    it('should not emit expired twice on consecutive expire() calls', async () => {
      const { session } = await createSession()
      const expiredSpy = jasmine.createSpy('expired')
      session.on('expired', expiredSpy)

      await session.expire()
      await session.expire()

      expect(expiredSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('touch', () => {
    it('should update lastActivity in store', async () => {
      const { session, store, advance } = await createSession()
      const initialActivity = store.state!.lastActivity

      advance(1000)
      await session.touch()

      expect(store.state!.lastActivity).toBeGreaterThan(initialActivity)
    })
  })

  describe('cross-tab synchronization', () => {
    it('should emit renewed when another tab changes the session ID', async () => {
      const { session, store } = await createSession()
      const renewedSpy = jasmine.createSpy('renewed')
      session.on('renewed', renewedSpy)
      const originalId = session.getId()

      // Simulate another tab renewing the session
      store.state = { ...store.state!, id: 'new-session-from-other-tab' }
      store.triggerExternalChange()

      // Wait for async handler
      await new Promise((r) => setTimeout(r, 0))

      expect(renewedSpy).toHaveBeenCalledTimes(1)
      expect(session.getId()).toBe('new-session-from-other-tab')
      expect(session.getId()).not.toBe(originalId)
    })

    it('should emit expired when another tab clears the session', async () => {
      const { session, store } = await createSession()
      const expiredSpy = jasmine.createSpy('expired')
      session.on('expired', expiredSpy)

      // Simulate another tab clearing the session
      store.state = undefined
      store.triggerExternalChange()

      await new Promise((r) => setTimeout(r, 0))

      expect(expiredSpy).toHaveBeenCalledTimes(1)
      expect(session.getId()).toBeUndefined()
    })

    it('should sync state when another tab updates lastActivity', async () => {
      const { session, store } = await createSession()

      // Simulate another tab touching the session
      store.state = { ...store.state!, lastActivity: 99999 }
      store.triggerExternalChange()

      await new Promise((r) => setTimeout(r, 0))

      // Session should have the updated state (no event emitted, just sync)
      expect(session.getId()).toBe(store.state!.id)
    })

    it('should not emit expired twice from external changes', async () => {
      const { session, store } = await createSession()
      const expiredSpy = jasmine.createSpy('expired')
      session.on('expired', expiredSpy)

      store.state = undefined
      store.triggerExternalChange()
      await new Promise((r) => setTimeout(r, 0))

      store.triggerExternalChange()
      await new Promise((r) => setTimeout(r, 0))

      expect(expiredSpy).toHaveBeenCalledTimes(1)
    })

    it('should stop watching on destroy()', async () => {
      const { session, store } = await createSession()
      const renewedSpy = jasmine.createSpy('renewed')
      session.on('renewed', renewedSpy)

      session.destroy()

      // External change after destroy should not trigger event
      store.state = { ...store.state!, id: 'after-destroy' }
      store.triggerExternalChange()
      await new Promise((r) => setTimeout(r, 0))

      expect(renewedSpy).not.toHaveBeenCalled()
    })
  })
})
