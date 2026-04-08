import type { SessionManager, startSessionManager } from '@datadog/browser-core'
import { Observable } from '../src/tools/observable'
import { noop } from '../src/tools/utils/functionUtils'
import { timeStampNow } from '../src/tools/utils/timeUtils'
import { LOW_HASH_UUID } from './sampling'

export interface SessionManagerMock extends SessionManager {
  setId(id: string): SessionManagerMock
  setNotTracked(): SessionManagerMock
  setTracked(): SessionManagerMock
  setForcedReplay(): SessionManagerMock
}

export const MOCK_SESSION_ID = LOW_HASH_UUID

const enum SessionStatus {
  TRACKED,
  NOT_TRACKED,
}

export function createSessionManagerMock(): SessionManagerMock {
  let id = MOCK_SESSION_ID
  let sessionIsActive = true
  let sessionStatus: SessionStatus = SessionStatus.TRACKED
  let forcedReplay = false

  return {
    findSession: () => {
      if (sessionStatus === SessionStatus.TRACKED && sessionIsActive) {
        return { id, isReplayForced: forcedReplay, anonymousId: 'device-123', createdAt: timeStampNow() }
      }
    },
    findTrackedSession: (_startTime, options) => {
      if (sessionStatus === SessionStatus.TRACKED && (sessionIsActive || options?.returnInactive)) {
        return { id, anonymousId: 'device-123', isReplayForced: forcedReplay, createdAt: timeStampNow() }
      }
    },
    expire() {
      sessionIsActive = false
      this.expireObservable.notify()
    },
    expireObservable: new Observable(),
    renewObservable: new Observable(),
    updateSessionState: noop,
    setId(newId) {
      id = newId
      return this
    },
    setNotTracked() {
      sessionStatus = SessionStatus.NOT_TRACKED
      return this
    },
    setTracked() {
      sessionStatus = SessionStatus.TRACKED
      return this
    },
    setForcedReplay() {
      forcedReplay = true
      return this
    },
  }
}

export function createStartSessionManagerMock(): typeof startSessionManager {
  return (_config, _consent, onReady) => {
    void Promise.resolve().then(() => onReady(createSessionManagerMock()))
  }
}
