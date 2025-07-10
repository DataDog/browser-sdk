import type { RelativeTime, TrackingConsentState } from '@datadog/browser-core'
import { Observable, performDraw, SESSION_NOT_TRACKED, startSessionManager } from '@datadog/browser-core'
import type { LogsConfiguration } from './configuration'

export const LOGS_SESSION_KEY = 'logs'

export interface LogsSessionManager {
  findTrackedSession: (startTime?: RelativeTime, options?: { returnInactive: boolean }) => LogsSession | undefined
  expireObservable: Observable<void>
}

export type LogsSession = {
  id?: string // session can be tracked without id
  anonymousId?: string // device id lasts across session
}

export const enum LoggerTrackingType {
  NOT_TRACKED = SESSION_NOT_TRACKED,
  TRACKED = '1',
}

export function startLogsSessionManager(
  configuration: LogsConfiguration,
  trackingConsentState: TrackingConsentState
): LogsSessionManager {
  const sessionManager = startSessionManager(
    configuration,
    LOGS_SESSION_KEY,
    (rawTrackingType) => computeTrackingType(configuration, rawTrackingType),
    trackingConsentState
  )
  return {
    findTrackedSession: (startTime?: RelativeTime, options = { returnInactive: false }) => {
      const session = sessionManager.findSession(startTime, options)
      return session && session.trackingType === LoggerTrackingType.TRACKED
        ? {
            id: session.id,
            anonymousId: session.anonymousId,
          }
        : undefined
    },
    expireObservable: sessionManager.expireObservable,
  }
}

export function startLogsSessionManagerStub(configuration: LogsConfiguration): LogsSessionManager {
  const isTracked = computeTrackingType(configuration) === LoggerTrackingType.TRACKED
  const session = isTracked ? {} : undefined
  return {
    findTrackedSession: () => session,
    expireObservable: new Observable(),
  }
}

function computeTrackingType(configuration: LogsConfiguration, rawTrackingType?: string) {
  if (hasValidLoggerSession(rawTrackingType)) {
    return rawTrackingType
  }
  if (!performDraw(configuration.sessionSampleRate)) {
    return LoggerTrackingType.NOT_TRACKED
  }
  return LoggerTrackingType.TRACKED
}

function hasValidLoggerSession(trackingType?: string): trackingType is LoggerTrackingType {
  return trackingType === LoggerTrackingType.NOT_TRACKED || trackingType === LoggerTrackingType.TRACKED
}
