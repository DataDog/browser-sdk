import type { SessionManager, startSessionManager } from '@datadog/browser-core'
import { Observable, noop } from '@datadog/browser-core'

export interface RumSessionManagerMock extends SessionManager {
  setId(id: string): RumSessionManagerMock
  setNotTracked(): RumSessionManagerMock
  setTrackedWithoutSessionReplay(): RumSessionManagerMock
  setTrackedWithSessionReplay(): RumSessionManagerMock
  setForcedReplay(): RumSessionManagerMock
}

const DEFAULT_ID = '00000000-aaaa-0000-aaaa-000000000000'
const enum SessionStatus {
  TRACKED_WITH_SESSION_REPLAY,
  TRACKED_WITHOUT_SESSION_REPLAY,
  NOT_TRACKED,
  EXPIRED,
}

export function createRumSessionManagerMock(): RumSessionManagerMock {
  let id = DEFAULT_ID
  let sessionStatus: SessionStatus = SessionStatus.TRACKED_WITH_SESSION_REPLAY
  let forcedReplay: boolean = false
  return {
    findSession: () => {
      if (
        sessionStatus === SessionStatus.TRACKED_WITH_SESSION_REPLAY ||
        sessionStatus === SessionStatus.TRACKED_WITHOUT_SESSION_REPLAY
      ) {
        return { id, isReplayForced: forcedReplay, anonymousId: 'device-123' }
      }
    },
    findTrackedSession() {
      if (
        sessionStatus !== SessionStatus.TRACKED_WITH_SESSION_REPLAY &&
        sessionStatus !== SessionStatus.TRACKED_WITHOUT_SESSION_REPLAY
      ) {
        return undefined
      }
      return {
        id,
        anonymousId: 'device-123',
        isReplayForced: forcedReplay,
      }
    },
    expire() {
      sessionStatus = SessionStatus.EXPIRED
      this.expireObservable.notify()
    },
    expireObservable: new Observable(),
    renewObservable: new Observable(),
    sessionStateUpdateObservable: new Observable(),
    updateSessionState: noop,
    setId(newId) {
      id = newId
      return this
    },
    setNotTracked() {
      sessionStatus = SessionStatus.NOT_TRACKED
      return this
    },
    setTrackedWithoutSessionReplay() {
      sessionStatus = SessionStatus.TRACKED_WITHOUT_SESSION_REPLAY
      return this
    },
    setTrackedWithSessionReplay() {
      sessionStatus = SessionStatus.TRACKED_WITH_SESSION_REPLAY
      return this
    },
    setForcedReplay() {
      forcedReplay = true
      return this
    },
  }
}

export function createRumStartSessionManagerMock(): typeof startSessionManager {
  return (_config, _consent, onReady) => onReady(createRumSessionManagerMock())
}
