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
  get(): Promise<SessionState | undefined>
  set(state: SessionState): Promise<void>
  clear(): Promise<void>
  onExternalChange(callback: () => void): () => void
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

  private constructor(state: SessionState, options: SessionOptions) {
    super()
    this.state = state
    this.store = options.store
    this.generateId = options.generateId
    this.now = options.now
  }

  static async create(options: SessionOptions): Promise<Session> {
    const existing = await options.store.get()
    if (existing) {
      return new Session(existing, options)
    }

    const now = options.now()
    const state: SessionState = {
      id: options.generateId(),
      deviceId: options.generateId(),
      created: now,
      lastActivity: now,
    }
    await options.store.set(state)
    return new Session(state, options)
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

  async touch(): Promise<void> {
    if (this.isExpired()) {
      return
    }
    this.state = { ...this.state, lastActivity: this.now() }
    await this.store.set(this.state)
  }

  async expire(): Promise<void> {
    if (this.expired) {
      return
    }
    this.expired = true
    await this.store.clear()
    this.emit('expired')
  }

  async renew(): Promise<void> {
    this.expired = false
    const now = this.now()
    this.state = {
      ...this.state,
      id: this.generateId(),
      created: now,
      lastActivity: now,
    }
    await this.store.set(this.state)
    this.emit('renewed')
  }
}

export type { SessionState, SessionStore, SessionOptions, SessionEvents }
export { Session }
