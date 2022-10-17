import type { Context, RawError, EventRateLimiter } from '@datadog/browser-core'
import {
  combine,
  isEmptyObject,
  limitModification,
  timeStampNow,
  currentDrift,
  display,
  createEventRateLimiter,
  canUseEventBridge,
  isSimulationActive,
  getSimulationLabel,
} from '@datadog/browser-core'
import type { RumEventDomainContext } from '../domainContext.types'
import type {
  CommonContext,
  RawRumErrorEvent,
  RawRumEvent,
  RawRumLongTaskEvent,
  RawRumResourceEvent,
  RumContext,
  User,
} from '../rawRumEvent.types'
import { RumEventType } from '../rawRumEvent.types'
import type { RumEvent } from '../rumEvent.types'
import { getSyntheticsContext } from './contexts/syntheticsContext'
import { getCiTestContext } from './contexts/ciTestContext'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'
import type { ViewContexts } from './contexts/viewContexts'
import type { RumSessionManager } from './rumSessionManager'
import type { UrlContexts } from './contexts/urlContexts'
import type { RumConfiguration } from './configuration'
import type { ActionContexts } from './rumEventsCollection/action/actionCollection'
import { getDisplayContext } from './contexts/displayContext'

// replaced at build time
declare const __BUILD_ENV__SDK_VERSION__: string

const enum SessionType {
  SYNTHETICS = 'synthetics',
  USER = 'user',
  CI_TEST = 'ci_test',
}

const VIEW_EVENTS_MODIFIABLE_FIELD_PATHS = [
  // Fields with sensitive data
  'view.url',
  'view.referrer',
  'action.target.name',
  'error.message',
  'error.stack',
  'error.resource.url',
  'resource.url',
]

const OTHER_EVENTS_MODIFIABLE_FIELD_PATHS = VIEW_EVENTS_MODIFIABLE_FIELD_PATHS.concat([
  // User-customizable field
  'context',
])

type Mutable<T> = { -readonly [P in keyof T]: T[P] }

export function startRumAssembly(
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  sessionManager: RumSessionManager,
  viewContexts: ViewContexts,
  urlContexts: UrlContexts,
  actionContexts: ActionContexts,
  getCommonContext: () => CommonContext,
  reportError: (error: RawError) => void
) {
  const eventRateLimiters = {
    [RumEventType.ERROR]: createEventRateLimiter(
      RumEventType.ERROR,
      configuration.eventRateLimiterThreshold,
      reportError
    ),
    [RumEventType.ACTION]: createEventRateLimiter(
      RumEventType.ACTION,
      configuration.eventRateLimiterThreshold,
      reportError
    ),
  }

  const syntheticsContext = getSyntheticsContext()
  const ciTestContext = getCiTestContext()

  lifeCycle.subscribe(
    LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
    ({ startTime, rawRumEvent, domainContext, savedCommonContext, customerContext }) => {
      const viewContext = viewContexts.findView(startTime)
      const urlContext = urlContexts.findUrl(startTime)
      // allow to send events if the session was tracked when they start
      // except for views which are continuously updated
      // TODO: stop sending view updates when session is expired
      const session = sessionManager.findTrackedSession(rawRumEvent.type !== RumEventType.VIEW ? startTime : undefined)
      if (session && viewContext && urlContext) {
        const commonContext = savedCommonContext || getCommonContext()
        const actionId = actionContexts.findActionId(startTime)

        const rumContext: RumContext = {
          _dd: {
            format_version: 2,
            drift: currentDrift(),
            session: {
              plan: session.plan,
            },
            browser_sdk_version: canUseEventBridge() ? __BUILD_ENV__SDK_VERSION__ : undefined,
          },
          application: {
            id: configuration.applicationId,
          },
          date: timeStampNow(),
          service: viewContext.service || configuration.service,
          version: viewContext.version || configuration.version,
          source: 'browser',
          session: {
            id: session.id,
            type: syntheticsContext ? SessionType.SYNTHETICS : ciTestContext ? SessionType.CI_TEST : SessionType.USER,
          },
          view: {
            id: viewContext.id,
            name: viewContext.name,
            url: urlContext.url,
            referrer: urlContext.referrer,
          },
          action: needToAssembleWithAction(rawRumEvent) && actionId ? { id: actionId } : undefined,
          synthetics: syntheticsContext,
          ci_test: ciTestContext,
          display: getDisplayContext(),
        }

        const serverRumEvent = combine(rumContext as RumContext & Context, rawRumEvent) as RumEvent & Context
        serverRumEvent.context = combine(commonContext.context, customerContext)

        if (isSimulationActive()) {
          serverRumEvent.context.simulation_label = getSimulationLabel()
        }

        if (!('has_replay' in serverRumEvent.session)) {
          ;(serverRumEvent.session as Mutable<RumEvent['session']>).has_replay = commonContext.hasReplay
        }

        if (!isEmptyObject(commonContext.user)) {
          ;(serverRumEvent.usr as Mutable<RumEvent['usr']>) = commonContext.user as User & Context
        }

        if (shouldSend(serverRumEvent, configuration.beforeSend, domainContext, eventRateLimiters)) {
          if (isEmptyObject(serverRumEvent.context)) {
            delete serverRumEvent.context
          }
          lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, serverRumEvent)
        }
      }
    }
  )
}

function shouldSend(
  event: RumEvent & Context,
  beforeSend: RumConfiguration['beforeSend'],
  domainContext: RumEventDomainContext,
  eventRateLimiters: { [key in RumEventType]?: EventRateLimiter }
) {
  if (beforeSend) {
    const result = limitModification(
      event,
      event.type === RumEventType.VIEW ? VIEW_EVENTS_MODIFIABLE_FIELD_PATHS : OTHER_EVENTS_MODIFIABLE_FIELD_PATHS,
      (event) => beforeSend(event, domainContext)
    )
    if (result === false && event.type !== RumEventType.VIEW) {
      return false
    }
    if (result === false) {
      display.warn("Can't dismiss view events using beforeSend!")
    }
  }

  const rateLimitReached = eventRateLimiters[event.type]?.isLimitReached()
  return !rateLimitReached
}

function needToAssembleWithAction(
  event: RawRumEvent
): event is RawRumErrorEvent | RawRumResourceEvent | RawRumLongTaskEvent {
  return [RumEventType.ERROR, RumEventType.RESOURCE, RumEventType.LONG_TASK].indexOf(event.type) !== -1
}
