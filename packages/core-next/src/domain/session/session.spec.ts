/* eslint-disable @typescript-eslint/unbound-method */
import { ONE_HOUR, ONE_MINUTE } from '../time'
import { Session } from './session'
import type { SessionOptions, SessionState, SessionStore } from './session'

const SESSION_MAX_AGE = 4 * ONE_HOUR
const SESSION_INACTIVITY_TIMEOUT = 15 * ONE_MINUTE

function stubStore(initial?: SessionState): SessionStore & { state: SessionState | undefined } {
  const stub = {
    state: initial,
    get: () => stub.state,
    set: (state: SessionState) => {
      stub.state = state
    },
    clear: () => {
      stub.state = undefined
    },
  }
  return stub
}

function createSession(overrides: Partial<SessionOptions> = {}) {
  let currentTime = 0
  let idCounter = 0
  const now = overrides.now ?? (() => currentTime)
  const generateId = overrides.generateId ?? (() => `id-${idCounter++}`)
  const store = (overrides.store as ReturnType<typeof stubStore>) ?? stubStore()

  const session = new Session({ store, generateId, now })

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
    it('should generate a session ID on creation when store is empty', () => {
      const { session } = createSession()

      expect(session.getId()).toBe('id-0')
    })

    it('should restore session ID from store', () => {
      const store = stubStore({ id: 'existing-id', deviceId: 'device-1', created: 0, lastActivity: 0 })
      const { session } = createSession({ store })

      expect(session.getId()).toBe('existing-id')
    })

    it('should generate a device ID on creation when store is empty', () => {
      const { session } = createSession()

      expect(session.getDeviceId()).toBe('id-1')
    })

    it('should restore device ID from store', () => {
      const store = stubStore({ id: 'session-1', deviceId: 'device-1', created: 0, lastActivity: 0 })
      const { session } = createSession({ store })

      expect(session.getDeviceId()).toBe('device-1')
    })

    it('should persist session state to store on creation', () => {
      const { session, store } = createSession()

      expect(store.state).toBeDefined()
      expect(store.state!.id).toBe(session.getId())
      expect(store.state!.deviceId).toBe(session.getDeviceId())
    })
  })

  describe('expiry', () => {
    it('should not be expired when just created', () => {
      const { session } = createSession()

      expect(session.isExpired()).toBe(false)
    })

    it('should expire after max age', () => {
      const { session, advance } = createSession()

      advance(SESSION_MAX_AGE + 1)

      expect(session.isExpired()).toBe(true)
    })

    it('should expire after inactivity timeout', () => {
      const { session, advance } = createSession()

      advance(SESSION_INACTIVITY_TIMEOUT + 1)

      expect(session.isExpired()).toBe(true)
    })

    it('should not expire if activity is reported within timeout', () => {
      const { session, advance } = createSession()

      advance(SESSION_INACTIVITY_TIMEOUT - 1)
      session.touch()
      advance(SESSION_INACTIVITY_TIMEOUT - 1)

      expect(session.isExpired()).toBe(false)
    })

    it('should expire even with activity after max age', () => {
      const { session, advance } = createSession()

      for (let i = 0; i < 20; i++) {
        advance(SESSION_MAX_AGE / 20)
        session.touch()
      }
      advance(1)

      expect(session.isExpired()).toBe(true)
    })

    it('should return undefined ID when expired', () => {
      const { session, advance } = createSession()

      advance(SESSION_MAX_AGE + 1)

      expect(session.getId()).toBeUndefined()
    })

    it('should force expire when expire() is called', () => {
      const { session } = createSession()

      session.expire()

      expect(session.isExpired()).toBe(true)
    })
  })

  describe('renewal', () => {
    it('should generate a new session ID on renew', () => {
      const { session } = createSession()
      const firstId = session.getId()

      session.renew()

      expect(session.getId()).toBeDefined()
      expect(session.getId()).not.toBe(firstId)
    })

    it('should keep the same device ID on renew', () => {
      const { session } = createSession()
      const deviceId = session.getDeviceId()

      session.renew()

      expect(session.getDeviceId()).toBe(deviceId)
    })

    it('should not be expired after renew', () => {
      const { session, advance } = createSession()
      advance(SESSION_MAX_AGE + 1)

      session.renew()

      expect(session.isExpired()).toBe(false)
    })

    it('should persist renewed state to store', () => {
      const { session, store } = createSession()

      session.renew()

      expect(store.state!.id).toBe(session.getId())
    })
  })

  describe('signals', () => {
    it('should emit expired when session expires via expire()', () => {
      const { session } = createSession()
      const expiredSpy = jasmine.createSpy('expired')
      session.on('expired', expiredSpy)

      session.expire()

      expect(expiredSpy).toHaveBeenCalledTimes(1)
    })

    it('should emit renewed when session is renewed', () => {
      const { session } = createSession()
      const renewedSpy = jasmine.createSpy('renewed')
      session.on('renewed', renewedSpy)

      session.renew()

      expect(renewedSpy).toHaveBeenCalledTimes(1)
    })

    it('should not emit expired twice on consecutive expire() calls', () => {
      const { session } = createSession()
      const expiredSpy = jasmine.createSpy('expired')
      session.on('expired', expiredSpy)

      session.expire()
      session.expire()

      expect(expiredSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('touch', () => {
    it('should update lastActivity in store', () => {
      const { session, store, advance } = createSession()
      const initialActivity = store.state!.lastActivity

      advance(1000)
      session.touch()

      expect(store.state!.lastActivity).toBeGreaterThan(initialActivity)
    })
  })
})
