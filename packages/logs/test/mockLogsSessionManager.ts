import type { SessionManager, startSessionManager } from '@datadog/browser-core'
import { Observable, noop } from '@datadog/browser-core'

export interface LogsSessionManagerMock extends SessionManager {
  setId(id: string): LogsSessionManagerMock
  setNotTracked(): LogsSessionManagerMock
  setTracked(): LogsSessionManagerMock
  expire(): LogsSessionManagerMock
}

const enum SessionStatus {
  TRACKED,
  NOT_TRACKED,
  EXPIRED,
}

export function createLogsSessionManagerMock(): LogsSessionManagerMock {
  let id = 'session-id'
  let sessionIsActive: boolean = true
  let sessionStatus: SessionStatus = SessionStatus.TRACKED

  return {
    findSession: () => {
      if (sessionStatus === SessionStatus.TRACKED && sessionIsActive) {
        return { id, isReplayForced: false, anonymousId: 'device-123' }
      }
    },
    findTrackedSession: (_sampleRate, _startTime, options) => {
      if (sessionStatus === SessionStatus.TRACKED && (sessionIsActive || options?.returnInactive)) {
        return { id, anonymousId: 'device-123', isReplayForced: false }
      }
    },
    renewObservable: new Observable(),
    expireObservable: new Observable(),
    sessionStateUpdateObservable: new Observable(),
    updateSessionState: noop,
    setId(newId: string) {
      id = newId
      return this
    },
    expire() {
      sessionIsActive = false
      this.expireObservable.notify()
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
  }
}

export function createLogStartSessionManagerMock(): typeof startSessionManager {
  return (_config, _consent, onReady) => onReady(createLogsSessionManagerMock())
}
