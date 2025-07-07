import type { Context, TrackingConsentState } from '@datadog/browser-core'
import { createTrackingConsentState } from '@datadog/browser-core'
import type { ExposureInitConfiguration } from '../domain/configuration'
import type { TrackExposureOptions } from '../domain/exposureCollection'
import { createPreStartStrategy } from './preStartExposure'
import { startExposure } from './startExposure'
import { buildCommonContext } from '../domain/contexts/commonContext'

export interface Strategy {
  init: (initConfiguration: ExposureInitConfiguration) => void
  trackExposure: (flagKey: string, flagValue: any, options?: TrackExposureOptions) => void
  getInternalContext: () => any
  globalContext: {
    getContext: () => Context
    setContext: (newContext: Context) => void
    setContextProperty: (key: string, property: any) => void
    removeContextProperty: (key: string) => void
    clearContext: () => void
  }
  accountContext: {
    getContext: () => Context
    setContext: (newContext: Context) => void
    setContextProperty: (key: string, property: any) => void
    removeContextProperty: (key: string) => void
    clearContext: () => void
  }
  userContext: {
    getContext: () => Context
    setContext: (newContext: Context) => void
    setContextProperty: (key: string, property: any) => void
    removeContextProperty: (key: string) => void
    clearContext: () => void
  }
  get initConfiguration(): ExposureInitConfiguration | undefined
}

export function makeExposurePublicApi(
  trackingConsentState: TrackingConsentState = createTrackingConsentState()
): Strategy {
  const getCommonContext = buildCommonContext

  const doStartExposure = (initConfiguration: ExposureInitConfiguration, configuration: any) => {
    return startExposure(configuration, getCommonContext, trackingConsentState)
  }

  return createPreStartStrategy(getCommonContext, trackingConsentState, doStartExposure)
} 