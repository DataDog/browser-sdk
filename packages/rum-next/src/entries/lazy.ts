import type {
  AbstractHooks,
  Batch,
  Context,
  ContextManager,
  Duration,
  EndpointBuilder,
  RawError,
  Telemetry,
  TimeStamp,
  Observable,
} from '@datadog/browser-core'
import {
  combine,
  createPageMayExitObservable,
  elapsed,
  noop,
  sanitize,
  sendToExtension,
  timeStampToClocks,
} from '@datadog/browser-core'
import { bindContextManager, createBufferedDataFromMessageBus, MessageType } from '@datadog/browser-internal-next'
import type {
  CoreInitializeConfiguration,
  CoreSessionManager,
  InternalApi,
  MessageEnvelope,
} from '@datadog/browser-internal-next'
import type { AssembledRumEvent, DurationVitalStart, RecorderApi } from '@datadog/browser-rum-core'
import {
  LifeCycle,
  LifeCycleEventType,
  RumEventType,
  startCustomerDataTelemetry,
  validateAndBuildRumConfiguration,
  createCustomVitalsState,
  startRumEventCollection,
  VitalType,
  ActionType,
} from '@datadog/browser-rum-core'

const recorderApi: RecorderApi = {
  // TODO: RecorderApi
  start: noop,
  stop: noop,
  isRecording: () => false,
  onRumStart: noop,
  getReplayStats: () => undefined,
  getSessionReplayLink: () => undefined,
}

export function initialize({
  coreInitializeConfiguration,
  sessionManager,
  createBatch,
  hooks,
  telemetry,
  internalApi,
  contexts,
}: {
  coreInitializeConfiguration: CoreInitializeConfiguration
  sessionManager: CoreSessionManager
  createBatch: (endpoints: EndpointBuilder[]) => Batch
  hooks: AbstractHooks
  telemetry: Telemetry
  internalApi: InternalApi
  contexts: {
    global: ContextManager
    user: ContextManager
    account: ContextManager
  }
}) {
  const configuration = validateAndBuildRumConfiguration({
    ...coreInitializeConfiguration,
    ...coreInitializeConfiguration.rum!,
  })
  if (!configuration) {
    return
  }

  const cleanupTasks: Array<() => void> = []
  const lifeCycle = new LifeCycle()

  sessionManager.expireObservable.subscribe(() => {
    lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
  })

  sessionManager.renewObservable.subscribe(() => {
    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
  })

  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (event) => sendToExtension('rum', event))

  lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (data) =>
    internalApi.notify({
      type: MessageType.RUM_RAW_EVENT_COLLECTED,
      data,
    })
  )
  lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, (event) => {
    internalApi.notify({
      type: MessageType.RUM_VIEW_CREATED,
      event,
    })
  })

  const reportError = (error: RawError) => {
    lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, { error })
    // TODO: expose telemetry functions
    // monitor-until: forever, to keep an eye on the errors reported to customers
    // addTelemetryDebug('Error reported to customer', { 'error.message': error.message })
  }

  // TODO: Is it fine to create another "page may exit" observable here?
  const pageMayExitObservable = createPageMayExitObservable(configuration)
  const pageMayExitSubscription = pageMayExitObservable.subscribe((event) => {
    lifeCycle.notify(LifeCycleEventType.PAGE_MAY_EXIT, event)
  })
  cleanupTasks.push(() => pageMayExitSubscription.unsubscribe())

  const endpoints = [configuration.rumEndpointBuilder]
  if (configuration.replica) {
    endpoints.push(configuration.replica.rumEndpointBuilder)
  }
  const batch = createBatch(endpoints)

  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (serverRumEvent: AssembledRumEvent) => {
    if (serverRumEvent.type === RumEventType.VIEW) {
      batch.upsert(serverRumEvent, serverRumEvent.view.id)
    } else {
      batch.add(serverRumEvent)
    }
  })
  startCustomerDataTelemetry(telemetry, lifeCycle, batch.flushController.flushObservable)

  // Convert internalApi message bus to bufferedDataObservable.
  // TODO: in the future, use message bus directly in `startRumEventCollection`
  const bufferedDataObservable = createBufferedDataFromMessageBus(internalApi.bus)

  const rumEvents = startRumEventCollection(
    lifeCycle,
    hooks,
    configuration,
    sessionManager,
    recorderApi,
    // TODO: initialViewOptions
    undefined,
    createCustomVitalsState(), // TODO: this is unused
    bufferedDataObservable,
    // TODO: sdkName
    'rum',
    reportError
  )
  cleanupTasks.push(rumEvents.stop)

  bindContextManager(contexts.global, rumEvents.globalContext)
  bindContextManager(contexts.user, rumEvents.userContext)
  bindContextManager(contexts.account, rumEvents.accountContext)
  bindVitalCollection(internalApi.bus, rumEvents.addDurationVital)
  bindErrorCollection(internalApi.bus, rumEvents.addError)
  bindActionCollection(internalApi.bus, rumEvents.addAction)

  return {
    stop: () => {
      cleanupTasks.forEach((task) => task())
    },
  }
}

function bindErrorCollection(
  bus: Observable<MessageEnvelope>,
  addError: ReturnType<typeof startRumEventCollection>['addError']
) {
  bus.subscribe(({ clocks, message }) => {
    switch (message.type) {
      case MessageType.RUM_ERROR: {
        addError({
          error: message.error, // Do not sanitize error here, it is needed unserialized by computeRawError()
          handlingStack: message.handlingStack,
          componentStack: message.componentStack,
          context: sanitize(message.context) as Context,
          startClocks: clocks,
        })
        break
      }
    }
  })
}

function bindActionCollection(
  bus: Observable<MessageEnvelope>,
  addAction: ReturnType<typeof startRumEventCollection>['addAction']
) {
  bus.subscribe(({ clocks, message }) => {
    switch (message.type) {
      case MessageType.RUM_ACTION: {
        addAction({
          name: sanitize(message.name)!,
          context: sanitize(message.context) as Context,
          startClocks: clocks,
          type: ActionType.CUSTOM,
          handlingStack: message.handlingStack,
        })
        break
      }
    }
  })
}

// TODO: in the future, handle this internally in `startVitalCollection`
function bindVitalCollection(
  bus: Observable<MessageEnvelope>,
  addDurationVital: ReturnType<typeof startRumEventCollection>['addDurationVital']
) {
  const customVitalState = createCustomVitalsState()
  bus.subscribe(({ clocks, message }) => {
    switch (message.type) {
      case MessageType.RUM_ADD_DURATION_VITAL: {
        const options = message.options
        addDurationVital({
          name: sanitize(message.name)!,
          type: VitalType.DURATION,
          startClocks: timeStampToClocks(options.startTime as TimeStamp),
          duration: options.duration as Duration,
          context: sanitize(options.context) as Context,
          description: sanitize(options.description) as string | undefined,
        })
        break
      }

      case MessageType.RUM_START_DURATION_VITAL: {
        const options = message.options
        const name = sanitize(message.name)!
        const vital = {
          name,
          startClocks: clocks,
          context: sanitize(options && options.context) as Context,
          description: sanitize(options && options.description) as string | undefined,
        }
        customVitalState.vitalsByName.set(name, vital)
        customVitalState.vitalsByReference.set(message.ref, vital)
        break
      }

      case MessageType.RUM_STOP_DURATION_VITAL: {
        const { options, nameOrRef } = message

        let vitalStart: DurationVitalStart | undefined
        if (typeof nameOrRef === 'string') {
          const sanitizedNameOrRef = sanitize(nameOrRef)!
          vitalStart = customVitalState.vitalsByName.get(sanitizedNameOrRef)
          customVitalState.vitalsByName.delete(sanitizedNameOrRef)
        } else {
          vitalStart = customVitalState.vitalsByReference.get(nameOrRef)
          customVitalState.vitalsByReference.delete(nameOrRef)
        }

        if (!vitalStart) {
          return
        }

        addDurationVital({
          name: vitalStart.name,
          type: VitalType.DURATION,
          startClocks: clocks,
          duration: elapsed(vitalStart.startClocks.timeStamp, clocks.timeStamp),
          context: combine(vitalStart.context, options?.context),
          description: options?.description ?? vitalStart.description,
        })
        break
      }
    }
  })
}
