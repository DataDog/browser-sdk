import type { Component, RelativeTime } from '@datadog/browser-core'
import { Observable, performDraw, startSessionManager } from '@datadog/browser-core'
import { getLogsConfiguration } from './configuration'
import type { LogsConfiguration } from './configuration'

export const LOGS_SESSION_KEY = 'logs'

export interface LogsSessionManager {
  findTrackedSession: (startTime?: RelativeTime) => LogsSession | undefined
  expireObservable: Observable<void>
}

export type LogsSession = {
  id?: string // session can be tracked without id
}

export const enum LoggerTrackingType {
  NOT_TRACKED = '0',
  TRACKED = '1',
}

export const startLogsSessionManager: Component<LogsSessionManager, [LogsConfiguration]> = (configuration) => {
  const sessionManager = startSessionManager(configuration, LOGS_SESSION_KEY, (rawTrackingType) =>
    computeSessionState(configuration, rawTrackingType)
  )
  return {
    findTrackedSession: (startTime) => {
      const session = sessionManager.findActiveSession(startTime)
      return session && session.trackingType === LoggerTrackingType.TRACKED
        ? {
            id: session.id,
          }
        : undefined
    },
    expireObservable: sessionManager.expireObservable,
  }
}
/* eslint-disable local-rules/disallow-side-effects */
startLogsSessionManager.$deps = [getLogsConfiguration]
/* eslint-enable local-rules/disallow-side-effects */

export const startLogsSessionManagerStub: Component<LogsSessionManager, [LogsConfiguration]> = (configuration) => {
  const isTracked = computeTrackingType(configuration) === LoggerTrackingType.TRACKED
  const session = isTracked ? {} : undefined
  return {
    findTrackedSession: () => session,
    expireObservable: new Observable(),
  }
}
/* eslint-disable local-rules/disallow-side-effects */
startLogsSessionManagerStub.$deps = [getLogsConfiguration]
/* eslint-enable local-rules/disallow-side-effects */

function computeTrackingType(configuration: LogsConfiguration) {
  if (!performDraw(configuration.sessionSampleRate)) {
    return LoggerTrackingType.NOT_TRACKED
  }
  return LoggerTrackingType.TRACKED
}

function computeSessionState(configuration: LogsConfiguration, rawSessionType?: string) {
  const trackingType = hasValidLoggerSession(rawSessionType) ? rawSessionType : computeTrackingType(configuration)
  return {
    trackingType,
    isTracked: trackingType === LoggerTrackingType.TRACKED,
  }
}

function hasValidLoggerSession(trackingType?: string): trackingType is LoggerTrackingType {
  return trackingType === LoggerTrackingType.NOT_TRACKED || trackingType === LoggerTrackingType.TRACKED
}
