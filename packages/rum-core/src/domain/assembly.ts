import type { Context, RawError, EventRateLimiter } from '@datadog/browser-core'
import {
  combine,
  isEmptyObject,
  timeStampNow,
  currentDrift,
  display,
  createEventRateLimiter,
  canUseEventBridge,
  round,
  isExperimentalFeatureEnabled,
  ExperimentalFeature,
  getConnectivity,
  addTelemetryDebug,
} from '@datadog/browser-core'
import type { RumEventDomainContext } from '../domainContext.types'
import { RumEventType } from '../rawRumEvent.types'
import type { CommonProperties, RumEvent } from '../rumEvent.types'
import type { Hooks } from '../hooks'
import { HookNames } from '../hooks'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'
import type { ViewHistory } from './contexts/viewHistory'
import type { RumSessionManager } from './rumSessionManager'
import type { RumConfiguration } from './configuration'
import type { DisplayContext } from './contexts/displayContext'
import type { ModifiableFieldPaths } from './limitModification'
import { limitModification } from './limitModification'
import type { UrlContexts } from './contexts/urlContexts'

// replaced at build time
declare const __BUILD_ENV__SDK_VERSION__: string

const VIEW_MODIFIABLE_FIELD_PATHS: ModifiableFieldPaths = {
  'view.name': 'string',
  'view.url': 'string',
  'view.referrer': 'string',
}

const USER_CUSTOMIZABLE_FIELD_PATHS: ModifiableFieldPaths = {
  context: 'object',
}

const ROOT_MODIFIABLE_FIELD_PATHS: ModifiableFieldPaths = {
  service: 'string',
  version: 'string',
}

let modifiableFieldPathsByEvent: { [key in RumEventType]: ModifiableFieldPaths }

export function startRumAssembly(
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  hooks: Hooks,
  sessionManager: RumSessionManager,
  viewHistory: ViewHistory,
  urlContexts: UrlContexts,
  displayContext: DisplayContext,
  reportError: (error: RawError) => void
) {
  modifiableFieldPathsByEvent = {
    [RumEventType.VIEW]: {
      'view.performance.lcp.resource_url': 'string',
      ...USER_CUSTOMIZABLE_FIELD_PATHS,
      ...VIEW_MODIFIABLE_FIELD_PATHS,
    },
    [RumEventType.ERROR]: {
      'error.message': 'string',
      'error.stack': 'string',
      'error.resource.url': 'string',
      'error.fingerprint': 'string',
      ...USER_CUSTOMIZABLE_FIELD_PATHS,
      ...VIEW_MODIFIABLE_FIELD_PATHS,
      ...ROOT_MODIFIABLE_FIELD_PATHS,
    },
    [RumEventType.RESOURCE]: {
      'resource.url': 'string',
      ...(isExperimentalFeatureEnabled(ExperimentalFeature.WRITABLE_RESOURCE_GRAPHQL)
        ? { 'resource.graphql': 'object' }
        : {}),
      ...USER_CUSTOMIZABLE_FIELD_PATHS,
      ...VIEW_MODIFIABLE_FIELD_PATHS,
      ...ROOT_MODIFIABLE_FIELD_PATHS,
    },
    [RumEventType.ACTION]: {
      'action.target.name': 'string',
      ...USER_CUSTOMIZABLE_FIELD_PATHS,
      ...VIEW_MODIFIABLE_FIELD_PATHS,
      ...ROOT_MODIFIABLE_FIELD_PATHS,
    },
    [RumEventType.LONG_TASK]: {
      'long_task.scripts[].source_url': 'string',
      'long_task.scripts[].invoker': 'string',
      ...USER_CUSTOMIZABLE_FIELD_PATHS,
      ...VIEW_MODIFIABLE_FIELD_PATHS,
    },
    [RumEventType.VITAL]: {
      ...USER_CUSTOMIZABLE_FIELD_PATHS,
      ...VIEW_MODIFIABLE_FIELD_PATHS,
    },
  }
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
    [RumEventType.VITAL]: createEventRateLimiter(
      RumEventType.VITAL,
      configuration.eventRateLimiterThreshold,
      reportError
    ),
  }

  lifeCycle.subscribe(
    LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
    ({ startTime, duration, rawRumEvent, domainContext, customerContext }) => {
      const viewHistoryEntry = viewHistory.findView(startTime)
      const urlContext = urlContexts.findUrl(startTime)
      const session = sessionManager.findTrackedSession(startTime)

      if (
        session &&
        viewHistoryEntry &&
        !urlContext &&
        isExperimentalFeatureEnabled(ExperimentalFeature.MISSING_URL_CONTEXT_TELEMETRY)
      ) {
        addTelemetryDebug('Missing URL entry', {
          debug: {
            eventType: rawRumEvent.type,
            startTime,
            urlEntries: urlContexts.getAllEntries(),
            urlDeletedEntries: urlContexts.getDeletedEntries(),
            viewEntries: viewHistory.getAllEntries(),
            viewDeletedEntries: viewHistory.getDeletedEntries(),
          },
        })
      }

      if (session && viewHistoryEntry && urlContext) {
        const rumContext: Partial<CommonProperties> = {
          _dd: {
            format_version: 2,
            drift: currentDrift(),
            configuration: {
              session_sample_rate: round(configuration.sessionSampleRate, 3),
              session_replay_sample_rate: round(configuration.sessionReplaySampleRate, 3),
            },
            browser_sdk_version: canUseEventBridge() ? __BUILD_ENV__SDK_VERSION__ : undefined,
          },
          application: {
            id: configuration.applicationId,
          },
          date: timeStampNow(),
          source: 'browser',
          display: displayContext.get(),
          connectivity: getConnectivity(),
        }

        const serverRumEvent = combine(
          rumContext,
          hooks.triggerHook(HookNames.Assemble, {
            eventType: rawRumEvent.type,
            startTime,
            duration,
          }) as RumEvent & Context,
          { context: customerContext },
          rawRumEvent
        ) as RumEvent & Context

        if (shouldSend(serverRumEvent, configuration.beforeSend, domainContext, eventRateLimiters)) {
          if (isEmptyObject(serverRumEvent.context!)) {
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
    const result = limitModification(event, modifiableFieldPathsByEvent[event.type], (event) =>
      beforeSend(event, domainContext)
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
