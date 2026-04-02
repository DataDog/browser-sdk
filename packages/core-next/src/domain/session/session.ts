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

interface SessionEvents {
  expired: void
  renewed: void
}

function generateId(): string {
  return crypto.randomUUID()
}

class Session extends EventEmitter<SessionEvents> {
  private state: SessionState
  private expired = false

  constructor(private readonly store: SessionStore) {
    super()
    const existing = store.get()
    if (existing) {
      this.state = existing
    } else {
      this.state = {
        id: generateId(),
        deviceId: generateId(),
        created: Date.now(),
        lastActivity: Date.now(),
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
    const now = Date.now()
    return now - this.state.created > SESSION_MAX_AGE || now - this.state.lastActivity > SESSION_INACTIVITY_TIMEOUT
  }

  touch(): void {
    if (this.isExpired()) {
      return
    }
    this.state = { ...this.state, lastActivity: Date.now() }
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
    this.state = {
      ...this.state,
      id: generateId(),
      created: Date.now(),
      lastActivity: Date.now(),
    }
    this.store.set(this.state)
    this.emit('renewed')
  }
}

export type { SessionState, SessionStore, SessionEvents }
export { Session }
