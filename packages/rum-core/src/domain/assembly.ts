import type { Context, RawError, EventRateLimiter, User, Account, RelativeTime } from '@datadog/browser-core'
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
import type { RawRumErrorEvent, RawRumEvent, RawRumLongTaskEvent, RawRumResourceEvent } from '../rawRumEvent.types'
import { RumEventType } from '../rawRumEvent.types'
import type { CommonProperties, RumEvent } from '../rumEvent.types'
import type { FeatureFlagContexts } from './contexts/featureFlagContext'
import { getSyntheticsContext } from './contexts/syntheticsContext'
import type { CiVisibilityContext } from './contexts/ciVisibilityContext'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'
import type { ViewHistory } from './contexts/viewHistory'
import { SessionReplayState, type RumSessionManager } from './rumSessionManager'
import type { UrlContexts } from './contexts/urlContexts'
import type { RumConfiguration, FeatureFlagsForEvents } from './configuration'
import type { ActionContexts } from './action/actionCollection'
import type { DisplayContext } from './contexts/displayContext'
import type { CommonContext } from './contexts/commonContext'
import type { ModifiableFieldPaths } from './limitModification'
import { limitModification } from './limitModification'

// replaced at build time
declare const __BUILD_ENV__SDK_VERSION__: string

const enum SessionType {
  SYNTHETICS = 'synthetics',
  USER = 'user',
  CI_TEST = 'ci_test',
}

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

type Mutable<T> = { -readonly [P in keyof T]: T[P] }

export function startRumAssembly(
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  sessionManager: RumSessionManager,
  viewHistory: ViewHistory,
  urlContexts: UrlContexts,
  actionContexts: ActionContexts,
  displayContext: DisplayContext,
  ciVisibilityContext: CiVisibilityContext,
  featureFlagContexts: FeatureFlagContexts,
  getCommonContext: () => CommonContext,
  reportError: (error: RawError) => void
) {
  modifiableFieldPathsByEvent = {
    [RumEventType.VIEW]: { ...USER_CUSTOMIZABLE_FIELD_PATHS, ...VIEW_MODIFIABLE_FIELD_PATHS },
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

  const syntheticsContext = getSyntheticsContext()
  lifeCycle.subscribe(
    LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
    ({ startTime, rawRumEvent, domainContext, savedCommonContext, customerContext }) => {
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
        const commonContext = savedCommonContext || getCommonContext()
        const actionId = actionContexts.findActionId(startTime)

        const rumContext: CommonProperties = {
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
          service: viewHistoryEntry.service || configuration.service,
          version: viewHistoryEntry.version || configuration.version,
          source: 'browser',
          session: {
            id: session.id,
            type: syntheticsContext
              ? SessionType.SYNTHETICS
              : ciVisibilityContext.get()
                ? SessionType.CI_TEST
                : SessionType.USER,
          },
          view: {
            id: viewHistoryEntry.id,
            name: viewHistoryEntry.name,
            url: urlContext.url,
            referrer: urlContext.referrer,
          },
          feature_flags: findFeatureFlagsContext(
            rawRumEvent,
            startTime,
            configuration.trackFeatureFlagsForEvents,
            featureFlagContexts
          ),
          action: needToAssembleWithAction(rawRumEvent) && actionId ? { id: actionId } : undefined,
          synthetics: syntheticsContext,
          ci_test: ciVisibilityContext.get(),
          display: displayContext.get(),
          connectivity: getConnectivity(),
        }

        const serverRumEvent = combine(rumContext, rawRumEvent) as RumEvent & Context
        serverRumEvent.context = combine(commonContext.context, viewHistoryEntry.context, customerContext)

        if (!('has_replay' in serverRumEvent.session)) {
          ;(serverRumEvent.session as Mutable<RumEvent['session']>).has_replay = commonContext.hasReplay
        }
        if (serverRumEvent.type === 'view') {
          ;(serverRumEvent.session as Mutable<RumEvent['session']>).sampled_for_replay =
            session.sessionReplay === SessionReplayState.SAMPLED
        }

        if (session.anonymousId && !commonContext.user.anonymous_id && !!configuration.trackAnonymousUser) {
          commonContext.user.anonymous_id = session.anonymousId
        }
        if (!isEmptyObject(commonContext.user)) {
          ;(serverRumEvent.usr as Mutable<RumEvent['usr']>) = commonContext.user as User & Context
        }

        if (!isEmptyObject(commonContext.account) && commonContext.account.id) {
          ;(serverRumEvent.account as Mutable<RumEvent['account']>) = commonContext.account as Account
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

function needToAssembleWithAction(
  event: RawRumEvent
): event is RawRumErrorEvent | RawRumResourceEvent | RawRumLongTaskEvent {
  return [RumEventType.ERROR, RumEventType.RESOURCE, RumEventType.LONG_TASK].indexOf(event.type) !== -1
}

function findFeatureFlagsContext(
  rawRumEvent: RawRumEvent,
  eventStartTime: RelativeTime,
  trackFeatureFlagsForEvents: FeatureFlagsForEvents[],
  featureFlagContexts: FeatureFlagContexts
) {
  const isTrackingEnforced = rawRumEvent.type === RumEventType.VIEW || rawRumEvent.type === RumEventType.ERROR

  const isListedInConfig = trackFeatureFlagsForEvents.includes(rawRumEvent.type as FeatureFlagsForEvents)

  if (isTrackingEnforced || isListedInConfig) {
    const featureFlagContext = featureFlagContexts.findFeatureFlagEvaluations(eventStartTime)
    if (featureFlagContext && !isEmptyObject(featureFlagContext)) {
      return featureFlagContext
    }
  }
}
