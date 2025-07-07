import type { TrackingConsentState } from '@datadog/browser-core'
import {
  sendToExtension,
  createPageMayExitObservable,
  willSyntheticsInjectRum,
  canUseEventBridge,
  startAccountContext,
  startGlobalContext,
  startUserContext,
} from '@datadog/browser-core'
import { startExposureSessionManager, startExposureSessionManagerStub } from '../domain/exposureSessionManager'
import type { ExposureConfiguration, ExposureInitConfiguration } from '../domain/configuration'
import { startExposureAssembly } from '../domain/assembly'
import { startExposureCollection } from '../domain/exposureCollection'
import { LifeCycle, LifeCycleEventType } from '../domain/lifeCycle'
import { startExposureBatch } from '../transport/startExposureBatch'
import { startExposureBridge } from '../transport/startExposureBridge'
import { startInternalContext } from '../domain/contexts/internalContext'
import type { CommonContext } from '../rawExposureEvent.types'
import { createHooks } from '../domain/hooks'
import { startRUMInternalContext } from '../domain/contexts/rumInternalContext'
import { buildCommonContext } from '../domain/contexts/commonContext'

const EXPOSURE_STORAGE_KEY = 'exposure'

export type StartExposure = typeof startExposure
export type StartExposureResult = ReturnType<StartExposure>

export function startExposure(
  configuration: ExposureConfiguration,
  getCommonContext: () => CommonContext,
  trackingConsentState: TrackingConsentState
) {
  const lifeCycle = new LifeCycle()
  const hooks = createHooks()
  const cleanupTasks: Array<() => void> = []

  lifeCycle.subscribe(LifeCycleEventType.EXPOSURE_COLLECTED, (exposure) => sendToExtension('logs', exposure))

  const reportError = (error: any) => {
    // In a real implementation, this would report errors to telemetry
    console.error('Exposure SDK error:', error)
  }

  const pageMayExitObservable = createPageMayExitObservable(configuration)

  const session =
    configuration.sessionStoreStrategyType && !canUseEventBridge() && !willSyntheticsInjectRum()
      ? startExposureSessionManager(configuration, trackingConsentState)
      : startExposureSessionManagerStub(configuration)

  const accountContext = startAccountContext(hooks, configuration, EXPOSURE_STORAGE_KEY)
  const userContext = startUserContext(hooks, configuration, session, EXPOSURE_STORAGE_KEY)
  const globalContext = startGlobalContext(hooks, configuration, EXPOSURE_STORAGE_KEY, false)
  const { stop, getRUMInternalContext } = startRUMInternalContext(hooks)

  const { trackExposure } = startExposureCollection(lifeCycle)

  startExposureAssembly(session, configuration, lifeCycle, hooks, getCommonContext, reportError)

  if (!canUseEventBridge()) {
    const { stop: stopExposureBatch } = startExposureBatch(
      configuration,
      lifeCycle,
      reportError,
      pageMayExitObservable,
      session
    )
    cleanupTasks.push(() => stopExposureBatch())
  } else {
    startExposureBridge(lifeCycle)
  }

  const internalContext = startInternalContext(session)

  return {
    trackExposure,
    getInternalContext: internalContext.get,
    accountContext,
    globalContext,
    userContext,
    stop: () => {
      cleanupTasks.forEach((task) => task())
      stop()
    },
  }
} 