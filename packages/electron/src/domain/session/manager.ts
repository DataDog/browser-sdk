import * as fs from 'node:fs'
import * as path from 'node:path'
import { app } from 'electron'
import type { TimeStamp } from '@datadog/browser-core'
import {
  Observable,
  generateUUID,
  timeStampNow,
  SESSION_TIME_OUT_DELAY,
  SESSION_EXPIRATION_DELAY,
} from '@datadog/browser-core'

interface State {
  id: string
  createdAt: TimeStamp
  lastActivityAt: TimeStamp
}

interface PersistedState extends State {
  anonymousId: string
}

const SESSION_FILE_NAME = '.dd_s'

// eslint-disable-next-line no-restricted-syntax
export class SessionManager {
  public stateObservable = new Observable<PersistedState>()
  public expireObservable = new Observable<void>()

  private readonly filePath: string
  private readonly anonymousId: string

  private state: State

  constructor(onActivityObservable: Observable<void>) {
    // Set up file path for persistence
    const userDataPath = app.getPath('userData')
    this.filePath = path.join(userDataPath, SESSION_FILE_NAME)

    // Load persisted data or initialize new session
    const fromState: PersistedState = this.loadPersistedData() ?? {
      anonymousId: generateUUID(),
      id: '',
      lastActivityAt: 0 as TimeStamp,
      createdAt: 0 as TimeStamp,
    }

    this.anonymousId = fromState.anonymousId
    this.state = {
      id: fromState.id,
      createdAt: fromState.createdAt,
      lastActivityAt: fromState.lastActivityAt,
    }
    this.expandOrRenewSession()

    // Subscribe to activity events to extend session
    onActivityObservable.subscribe(() => {
      this.expandOrRenewSession()
    })
  }

  public getSession(): PersistedState {
    return {
      anonymousId: this.anonymousId,
      id: this.state.id,
      createdAt: this.state.createdAt,
      lastActivityAt: this.state.lastActivityAt,
    }
  }

  private expandOrRenewSession(): void {
    const now = timeStampNow()

    const timeSinceLastActivity = now - this.state.lastActivityAt
    const timeSinceCreation = now - this.state.createdAt

    const shouldRenew = timeSinceLastActivity >= 1 * 60 * 1000 || timeSinceCreation >= SESSION_TIME_OUT_DELAY

    if (shouldRenew) {
      this.renewSession()
    } else {
      this.expandSession()
    }
  }

  /**
   * Expand session by updating last activity time
   */
  private expandSession(): void {
    this.state.lastActivityAt = timeStampNow()
    this.persistState()
    console.debug('[Datadog] Expanded session', this.getSession())
    this.stateObservable.notify(this.getSession())
  }

  /**
   * Renew session by generating a new session ID
   */
  private renewSession(): void {
    const now = timeStampNow()

    this.state = {
      id: generateUUID(),
      createdAt: now,
      lastActivityAt: now,
    }

    // Persist new state
    this.persistState()
    this.expireObservable.notify()
  }

  /**
   * Load persisted session data from disk
   */
  private loadPersistedData(): PersistedState | undefined {
    try {
      if (!fs.existsSync(this.filePath)) {
        return undefined
      }

      const fileContent = fs.readFileSync(this.filePath, 'utf-8')
      return JSON.parse(fileContent) as PersistedState
    } catch {
      return undefined
    }
  }

  /**
   * Persist current session state to disk (async, non-blocking)
   */
  private persistState(): void {
    const data: PersistedState = {
      anonymousId: this.anonymousId,
      id: this.state.id,
      createdAt: this.state.createdAt,
      lastActivityAt: this.state.lastActivityAt,
    }

    const fileContent = JSON.stringify(data, null, 2)
    try {
      fs.writeFileSync(this.filePath, fileContent, 'utf-8')
    } catch {
      // send telemetry
    }
  }
}
