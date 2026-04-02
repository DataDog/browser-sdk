import { ONE_HOUR, ONE_MINUTE } from '../time'
import { Session } from './session'
import type { SessionStore, SessionState } from './session'

const SESSION_MAX_AGE = 4 * ONE_HOUR
const SESSION_INACTIVITY_TIMEOUT = 15 * ONE_MINUTE

function stubStore(initial?: SessionState): SessionStore & { state: SessionState | undefined } {
  const stub = {
    state: initial,
    get() {
      return stub.state
    },
    set(state: SessionState) {
      stub.state = state
    },
    clear() {
      stub.state = undefined
    },
  }
  return stub
}

describe('Session', () => {
  let clock: jasmine.Clock

  beforeEach(() => {
    clock = jasmine.clock()
    clock.install()
    clock.mockDate()
  })

  afterEach(() => {
    clock.uninstall()
  })

  describe('identity', () => {
    it('should generate a session ID on creation when store is empty', () => {
      const session = new Session(stubStore())

      expect(session.getId()).toBeDefined()
      expect(session.getId()).toMatch(/^[a-f0-9-]+$/)
    })

    it('should restore session ID from store', () => {
      const store = stubStore({
        id: 'existing-id',
        deviceId: 'device-1',
        created: Date.now(),
        lastActivity: Date.now(),
      })
      const session = new Session(store)

      expect(session.getId()).toBe('existing-id')
    })

    it('should generate a device ID on creation when store is empty', () => {
      const session = new Session(stubStore())

      expect(session.getDeviceId()).toBeDefined()
      expect(session.getDeviceId()).toMatch(/^[a-f0-9-]+$/)
    })

    it('should restore device ID from store', () => {
      const store = stubStore({ id: 'session-1', deviceId: 'device-1', created: Date.now(), lastActivity: Date.now() })
      const session = new Session(store)

      expect(session.getDeviceId()).toBe('device-1')
    })

    it('should persist session state to store on creation', () => {
      const store = stubStore()
      const session = new Session(store)

      expect(store.state).toBeDefined()
      expect(store.state!.id).toBe(session.getId())
      expect(store.state!.deviceId).toBe(session.getDeviceId())
    })
  })

  describe('expiry', () => {
    it('should not be expired when just created', () => {
      const session = new Session(stubStore())

      expect(session.isExpired()).toBe(false)
    })

    it('should expire after max age', () => {
      const session = new Session(stubStore())

      clock.tick(SESSION_MAX_AGE + 1)

      expect(session.isExpired()).toBe(true)
    })

    it('should expire after inactivity timeout', () => {
      const session = new Session(stubStore())

      clock.tick(SESSION_INACTIVITY_TIMEOUT + 1)

      expect(session.isExpired()).toBe(true)
    })

    it('should not expire if activity is reported within timeout', () => {
      const session = new Session(stubStore())

      clock.tick(SESSION_INACTIVITY_TIMEOUT - 1)
      session.touch()
      clock.tick(SESSION_INACTIVITY_TIMEOUT - 1)

      expect(session.isExpired()).toBe(false)
    })

    it('should expire even with activity after max age', () => {
      const session = new Session(stubStore())

      for (let i = 0; i < 20; i++) {
        clock.tick(SESSION_MAX_AGE / 20)
        session.touch()
      }
      clock.tick(1)

      expect(session.isExpired()).toBe(true)
    })

    it('should return undefined ID when expired', () => {
      const session = new Session(stubStore())

      clock.tick(SESSION_MAX_AGE + 1)

      expect(session.getId()).toBeUndefined()
    })

    it('should force expire when expire() is called', () => {
      const session = new Session(stubStore())

      session.expire()

      expect(session.isExpired()).toBe(true)
    })
  })

  describe('renewal', () => {
    it('should generate a new session ID on renew', () => {
      const session = new Session(stubStore())
      const firstId = session.getId()

      session.renew()

      expect(session.getId()).toBeDefined()
      expect(session.getId()).not.toBe(firstId)
    })

    it('should keep the same device ID on renew', () => {
      const session = new Session(stubStore())
      const deviceId = session.getDeviceId()

      session.renew()

      expect(session.getDeviceId()).toBe(deviceId)
    })

    it('should not be expired after renew', () => {
      const session = new Session(stubStore())
      clock.tick(SESSION_MAX_AGE + 1)

      session.renew()

      expect(session.isExpired()).toBe(false)
    })

    it('should persist renewed state to store', () => {
      const store = stubStore()
      const session = new Session(store)

      session.renew()

      expect(store.state!.id).toBe(session.getId())
    })
  })

  describe('signals', () => {
    it('should emit expired when session expires via expire()', () => {
      const session = new Session(stubStore())
      const expiredSpy = jasmine.createSpy('expired')
      session.on('expired', expiredSpy)

      session.expire()

      expect(expiredSpy).toHaveBeenCalledTimes(1)
    })

    it('should emit renewed when session is renewed', () => {
      const session = new Session(stubStore())
      const renewedSpy = jasmine.createSpy('renewed')
      session.on('renewed', renewedSpy)

      session.renew()

      expect(renewedSpy).toHaveBeenCalledTimes(1)
    })

    it('should not emit expired twice on consecutive expire() calls', () => {
      const session = new Session(stubStore())
      const expiredSpy = jasmine.createSpy('expired')
      session.on('expired', expiredSpy)

      session.expire()
      session.expire()

      expect(expiredSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('touch', () => {
    it('should update lastActivity in store', () => {
      const store = stubStore()
      const session = new Session(store)
      const initialActivity = store.state!.lastActivity

      clock.tick(1000)
      session.touch()

      expect(store.state!.lastActivity).toBeGreaterThan(initialActivity)
    })
  })
})
