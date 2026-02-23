import { Observable } from '@datadog/browser-core'
import type { startLogsSessionManager, LogsSessionManager } from '../src/domain/logsSessionManager'
import { LoggerTrackingType } from '../src/domain/logsSessionManager'

export interface LogsSessionManagerMock extends LogsSessionManager {
  setId(id: string): LogsSessionManager
  setNotTracked(): LogsSessionManager
  setTracked(): LogsSessionManager
  expire(): LogsSessionManager
}

export function createLogsSessionManagerMock(): LogsSessionManagerMock {
  let id = 'session-id'
  let sessionIsActive: boolean = true
  let sessionStatus = LoggerTrackingType.TRACKED

  return {
    setId(newId: string) {
      id = newId
      return this
    },
    findTrackedSession: (_startTime, options) => {
      if (sessionStatus === LoggerTrackingType.TRACKED && (sessionIsActive || options?.returnInactive)) {
        return { id, anonymousId: 'device-123' }
      }
    },
    expireObservable: new Observable(),
    expire() {
      sessionIsActive = false
      this.expireObservable.notify()
      return this
    },
    setNotTracked() {
      sessionStatus = LoggerTrackingType.NOT_TRACKED
      return this
    },
    setTracked() {
      sessionStatus = LoggerTrackingType.TRACKED
      return this
    },
  }
}

export function createLogStartSessionManagerMock(): typeof startLogsSessionManager {
  return (_config, _consent, onReady) => onReady(createLogsSessionManagerMock())
}
