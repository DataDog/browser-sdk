import type { RelativeTime, TrackingConsentState } from '@datadog/browser-core'
import { generateUUID, isSampled, Observable, SESSION_NOT_TRACKED, startSessionManager } from '@datadog/browser-core'
import type { LogsConfiguration } from './configuration'

export interface LogsSessionManager {
  findTrackedSession: (startTime?: RelativeTime, options?: { returnInactive: boolean }) => LogsSession | undefined
  expireObservable: Observable<void>
}

export interface LogsSession {
  id?: string // session can be tracked without id
  anonymousId?: string // device id lasts across session
}

export const enum LoggerTrackingType {
  NOT_TRACKED = SESSION_NOT_TRACKED,
  TRACKED = '1',
}

export function startLogsSessionManager(
  configuration: LogsConfiguration,
  trackingConsentState: TrackingConsentState,
  onReady: (sessionManager: LogsSessionManager) => void
) {
  startSessionManager(configuration, trackingConsentState, (sessionManager) => {
    onReady({
      findTrackedSession: (startTime?: RelativeTime, options = { returnInactive: false }) => {
        const session = sessionManager.findSession(startTime, options)
        if (!session || session.id === 'invalid') {
          return
        }

        const trackingType = computeTrackingType(configuration, session.id)
        if (trackingType === LoggerTrackingType.NOT_TRACKED) {
          return
        }

        return {
          id: session.id,
          anonymousId: session.anonymousId,
        }
      },
      expireObservable: sessionManager.expireObservable,
    })
  })
}

export function startLogsSessionManagerStub(
  configuration: LogsConfiguration,
  _trackingConsentState: TrackingConsentState,
  onReady: (sessionManager: LogsSessionManager) => void
): void {
  // Generate a session ID for deterministic sampling in stub mode
  const stubSessionId = generateUUID()
  const isTracked = computeTrackingType(configuration, stubSessionId) === LoggerTrackingType.TRACKED
  const session: LogsSession | undefined = isTracked ? { id: stubSessionId } : undefined
  onReady({
    findTrackedSession: () => session,
    expireObservable: new Observable(),
  })
}

function computeTrackingType(configuration: LogsConfiguration, sessionId: string): LoggerTrackingType {
  if (!isSampled(sessionId, configuration.sessionSampleRate)) {
    return LoggerTrackingType.NOT_TRACKED
  }

  return LoggerTrackingType.TRACKED
}
