import type {
  Configuration,
  DeflateEncoderStreamId,
  Encoder,
  EndpointBuilder,
  TrackingConsentState,
} from '@datadog/browser-core'
import {
  abstractHooks,
  buildAccountContextManager,
  buildGlobalContextManager,
  buildUserContextManager,
  createBatch,
  createFlushController,
  createHttpRequest,
  createIdentityEncoder,
  createPageMayExitObservable,
  createTrackingConsentState,
  startSessionManager,
  startTelemetry,
  TelemetryService,
  validateAndBuildConfiguration,
} from '@datadog/browser-core'
import type { CoreInitializeConfiguration, CoreSessionManager } from '@datadog/browser-internal-next'
import { CoreContextType, getInternalApi, MessageType } from '@datadog/browser-internal-next'
import { SessionReplayState } from '@datadog/browser-rum-core'

export function initialize(
  initializeConfiguration: CoreInitializeConfiguration,
  createEncoder: (streamId: DeflateEncoderStreamId) => Encoder = createIdentityEncoder
) {
  const configuration = validateAndBuildConfiguration(initializeConfiguration)
  if (!configuration) {
    return
  }

  const internalApi = getInternalApi()
  const hooks = abstractHooks() // TODO: specialized hook
  const contexts = startContexts()

  const reportError = () => {
    // TODO
  }
  const pageMayExitObservable = createPageMayExitObservable(configuration)
  const telemetry = startTelemetry(
    TelemetryService.RUM,
    configuration,
    hooks,
    reportError,
    pageMayExitObservable,
    createIdentityEncoder // Keep using the identity encoder here, so we can sent telemetry even if deflate isn't working
  )

  const trackingConsentState = createTrackingConsentState()

  // TODO: handle bridge

  const sessionManager = startCoreSessionManager(configuration, trackingConsentState)

  return {
    coreInitializeConfiguration: initializeConfiguration,
    createEncoder,
    internalApi,
    hooks,
    contexts,
    telemetry,
    sessionManager,
    createBatch: (endpoints: EndpointBuilder[]) =>
      createBatch({
        encoder: createEncoder(
          Math.random() as any // TODO: remove named stream id
        ),
        request: createHttpRequest(endpoints, reportError),
        flushController: createFlushController({
          pageMayExitObservable,
          sessionExpireObservable: sessionManager.expireObservable,
        }),
      }),
  }
}

function startContexts() {
  const global = buildGlobalContextManager()
  const user = buildUserContextManager()
  const account = buildAccountContextManager()

  const contextsByType = {
    [CoreContextType.GLOBAL]: global,
    [CoreContextType.USER]: user,
    [CoreContextType.ACCOUNT]: account,
  }

  getInternalApi().bus.subscribe(({ message }) => {
    switch (message.type) {
      case MessageType.CORE_SET_CONTEXT:
        contextsByType[message.context].setContext(message.value)
        break

      case MessageType.CORE_SET_CONTEXT_PROPERTY:
        contextsByType[message.context].setContextProperty(message.key, message.value)
        break

      case MessageType.CORE_CLEAR_CONTEXT:
        contextsByType[message.context].clearContext()
        break
    }
  })

  return {
    global,
    user,
    account,
  }
}

function startCoreSessionManager(
  configuration: Configuration,
  trackingConsentState: TrackingConsentState
): CoreSessionManager {
  // TODO: we should use a fallback if:
  // * there is an event bridge
  // * configuration.sessionStoreStrategyType is undefined (ex: no cookie access)

  const sessionManager = startSessionManager<string>(
    configuration,
    // TODO: product type will be removed in the future session manager
    'x',
    () => 'x',
    trackingConsentState
  )

  sessionManager.sessionStateUpdateObservable.subscribe(({ previousState, newState }) => {
    if (!previousState.forcedReplay && newState.forcedReplay) {
      const sessionEntity = sessionManager.findSession()
      if (sessionEntity) {
        sessionEntity.isReplayForced = true
      }
    }
  })

  return {
    ...sessionManager,
    findTrackedSession: (startTime) => {
      const session = sessionManager.findSession(startTime)
      if (!session) {
        return
      }
      return {
        id: session.id,
        sessionReplay: SessionReplayState.OFF, // TODO
        anonymousId: session.anonymousId,
      }
    },
    setForcedReplay: () => sessionManager.updateSessionState({ forcedReplay: '1' }),
  }
}
