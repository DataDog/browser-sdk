import type { RelativeTime, TrackingConsentState } from '@datadog/browser-core'
import { Observable, performDraw, SESSION_NOT_TRACKED, startSessionManager } from '@datadog/browser-core'
import type { ExposureConfiguration } from './configuration'

export const EXPOSURE_SESSION_KEY = 'exposure'

export const enum ExposureTrackingType {
  NOT_TRACKED = SESSION_NOT_TRACKED,
  TRACKED = '1',
}

export type ExposureSession = {
  id?: string
  anonymousId?: string
}

export interface ExposureSessionManager {
  findTrackedSession: (startTime?: RelativeTime, options?: { returnInactive?: boolean }) => ExposureSession | undefined
  expireObservable: Observable<void>
}

export function startExposureSessionManager(
  configuration: ExposureConfiguration,
  trackingConsentState: TrackingConsentState
): ExposureSessionManager {
  const sessionManager = startSessionManager(
    configuration,
    EXPOSURE_SESSION_KEY,
    (rawTrackingType) => computeTrackingType(configuration, rawTrackingType),
    trackingConsentState
  )
  return {
    findTrackedSession: (startTime?: RelativeTime, options = { returnInactive: false }) => {
      const session = sessionManager.findSession(startTime, { returnInactive: options.returnInactive || false })
      return session && session.trackingType === ExposureTrackingType.TRACKED
        ? {
            id: session.id,
            anonymousId: session.anonymousId,
          }
        : undefined
    },
    expireObservable: sessionManager.expireObservable,
  }
}

export function startExposureSessionManagerStub(configuration: ExposureConfiguration): ExposureSessionManager {
  return {
    findTrackedSession: () => undefined,
    expireObservable: new Observable(),
  }
}

function computeTrackingType(configuration: ExposureConfiguration, rawTrackingType?: string) {
  if (hasValidExposureSession(rawTrackingType)) {
    return rawTrackingType
  }
  if (!performDraw(configuration.sessionSampleRate)) {
    return ExposureTrackingType.NOT_TRACKED
  }
  return ExposureTrackingType.TRACKED
}

function hasValidExposureSession(trackingType?: string): trackingType is ExposureTrackingType {
  return (
    trackingType === ExposureTrackingType.NOT_TRACKED ||
    trackingType === ExposureTrackingType.TRACKED
  )
} 