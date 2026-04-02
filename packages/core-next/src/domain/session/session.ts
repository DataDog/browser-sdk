import { EventEmitter } from '../../utils'
import { ONE_HOUR, ONE_MINUTE } from '../time'

const SESSION_MAX_AGE = 4 * ONE_HOUR
const SESSION_INACTIVITY_TIMEOUT = 15 * ONE_MINUTE

interface SessionState {
  id: string
  deviceId: string
  created: number
  lastActivity: number
}

interface SessionStore {
  get(): SessionState | undefined
  set(state: SessionState): void
  clear(): void
}

interface SessionOptions {
  store: SessionStore
  generateId: () => string
  now: () => number
}

interface SessionEvents {
  expired: void
  renewed: void
}

class Session extends EventEmitter<SessionEvents> {
  private state: SessionState
  private expired = false
  private readonly generateId: () => string
  private readonly now: () => number
  private readonly store: SessionStore

  constructor(options: SessionOptions) {
    super()
    this.store = options.store
    this.generateId = options.generateId
    this.now = options.now

    const existing = this.store.get()
    if (existing) {
      this.state = existing
    } else {
      const now = this.now()
      this.state = {
        id: this.generateId(),
        deviceId: this.generateId(),
        created: now,
        lastActivity: now,
      }
      this.store.set(this.state)
    }
  }

  getId(): string | undefined {
    if (this.isExpired()) {
      return undefined
    }
    return this.state.id
  }

  getDeviceId(): string {
    return this.state.deviceId
  }

  isExpired(): boolean {
    if (this.expired) {
      return true
    }
    const now = this.now()
    return now - this.state.created > SESSION_MAX_AGE || now - this.state.lastActivity > SESSION_INACTIVITY_TIMEOUT
  }

  touch(): void {
    if (this.isExpired()) {
      return
    }
    this.state = { ...this.state, lastActivity: this.now() }
    this.store.set(this.state)
  }

  expire(): void {
    if (this.expired) {
      return
    }
    this.expired = true
    this.store.clear()
    this.emit('expired')
  }

  renew(): void {
    this.expired = false
    const now = this.now()
    this.state = {
      ...this.state,
      id: this.generateId(),
      created: now,
      lastActivity: now,
    }
    this.store.set(this.state)
    this.emit('renewed')
  }
}

export type { SessionState, SessionStore, SessionOptions, SessionEvents }
export { Session }
