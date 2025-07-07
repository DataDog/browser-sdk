import type { Context, EventRateLimiter, RawError } from '@datadog/browser-core'
import { HookNames, combine, createEventRateLimiter, getRelativeTime } from '@datadog/browser-core'
import type { CommonContext } from '../rawExposureEvent.types'
import type { ExposureEvent } from '../exposureEvent.types'
import type { ExposureConfiguration } from './configuration'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'
import type { ExposureSessionManager } from './exposureSessionManager'
import type { DefaultExposureEventAttributes, Hooks } from './hooks'

export function startExposureAssembly(
  sessionManager: ExposureSessionManager,
  configuration: ExposureConfiguration,
  lifeCycle: LifeCycle,
  hooks: Hooks,
  getCommonContext: () => CommonContext,
  reportError: (error: RawError) => void
) {
  const exposureRateLimiter = createEventRateLimiter(
    'exposure',
    configuration.eventRateLimiterThreshold,
    reportError
  )

  lifeCycle.subscribe(
    LifeCycleEventType.RAW_EXPOSURE_COLLECTED,
    ({ rawExposureEvent, messageContext = undefined, savedCommonContext = undefined, domainContext }) => {
      const startTime = getRelativeTime(rawExposureEvent.date)
      const session = sessionManager.findTrackedSession(startTime)
      const shouldSendExposure = sessionManager.findTrackedSession(startTime, { returnInactive: true })

      if (!shouldSendExposure) {
        return
      }

      const commonContext = savedCommonContext || getCommonContext()
      const defaultExposureEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        startTime,
      }) as DefaultExposureEventAttributes

      const exposure = combine(
        {
          service: configuration.service,
          version: configuration.version,
          env: configuration.env,
          session_id: session ? session.id : undefined,
          session: session ? { id: session.id } : undefined,
          view: commonContext.view,
          usr: commonContext.user,
          application: commonContext.application,
        },
        defaultExposureEventAttributes,
        rawExposureEvent,
        messageContext
      ) as ExposureEvent & Context

      if (
        configuration.beforeSend?.(exposure, domainContext || {}) === false ||
        exposureRateLimiter.isLimitReached()
      ) {
        return
      }

      lifeCycle.notify(LifeCycleEventType.EXPOSURE_COLLECTED, exposure)
    }
  )
} 