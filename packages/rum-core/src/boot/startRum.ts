import { combine, Configuration, InternalMonitoring, isEventBridgePresent, Observable } from '@datadog/browser-core'
import { createDOMMutationObservable } from '../browser/domMutationObservable'
import { startPerformanceCollection } from '../browser/performanceCollection'
import { startRumAssembly } from '../domain/assembly'
import { startForegroundContexts } from '../domain/foregroundContexts'
import { startInternalContext } from '../domain/internalContext'
import { LifeCycle } from '../domain/lifeCycle'
import { startParentContexts } from '../domain/parentContexts'
import { startRequestCollection } from '../domain/requestCollection'
import { startActionCollection } from '../domain/rumEventsCollection/action/actionCollection'
import { startErrorCollection } from '../domain/rumEventsCollection/error/errorCollection'
import { startLongTaskCollection } from '../domain/rumEventsCollection/longTask/longTaskCollection'
import { startResourceCollection } from '../domain/rumEventsCollection/resource/resourceCollection'
import { startViewCollection } from '../domain/rumEventsCollection/view/viewCollection'
import { RumSession, startRumSession, startRumSessionStub } from '../domain/rumSession'
import { CommonContext } from '../rawRumEvent.types'
import { startRumBatch } from '../transport/batch'
import { startRumEventBridge } from '../transport/startRumEventBridge'
import { startUrlContexts } from '../domain/urlContexts'
import { createLocationChangeObservable, LocationChange } from '../browser/locationChangeObservable'
import { RecorderApi, RumInitConfiguration } from './rumPublicApi'

export function startRum(
  initConfiguration: RumInitConfiguration,
  configuration: Configuration,
  internalMonitoring: InternalMonitoring,
  getCommonContext: () => CommonContext,
  recorderApi: RecorderApi,
  initialViewName?: string
) {
  const lifeCycle = new LifeCycle()
  const session = !isEventBridgePresent() ? startRumSession(configuration, lifeCycle) : startRumSessionStub()
  const domMutationObservable = createDOMMutationObservable()
  const locationChangeObservable = createLocationChangeObservable(location)

  internalMonitoring.setExternalContextProvider(() =>
    combine(
      {
        application_id: initConfiguration.applicationId,
      },
      parentContexts.findView(),
      { view: { name: null } }
    )
  )

  const { parentContexts, foregroundContexts, urlContexts } = startRumEventCollection(
    initConfiguration.applicationId,
    lifeCycle,
    configuration,
    location,
    session,
    locationChangeObservable,
    getCommonContext
  )

  startLongTaskCollection(lifeCycle, session)
  startResourceCollection(lifeCycle)
  const { addTiming, startView } = startViewCollection(
    lifeCycle,
    configuration,
    location,
    domMutationObservable,
    locationChangeObservable,
    foregroundContexts,
    recorderApi,
    initialViewName
  )
  const { addError } = startErrorCollection(lifeCycle, foregroundContexts)
  const { addAction } = startActionCollection(lifeCycle, domMutationObservable, configuration, foregroundContexts)

  startRequestCollection(lifeCycle, configuration, session)
  startPerformanceCollection(lifeCycle, configuration)

  const internalContext = startInternalContext(initConfiguration.applicationId, session, parentContexts, urlContexts)

  return {
    addAction,
    addError,
    addTiming,
    startView,
    lifeCycle,
    parentContexts,
    session,
    getInternalContext: internalContext.get,
  }
}

export function startRumEventCollection(
  applicationId: string,
  lifeCycle: LifeCycle,
  configuration: Configuration,
  location: Location,
  session: RumSession,
  locationChangeObservable: Observable<LocationChange>,
  getCommonContext: () => CommonContext
) {
  const parentContexts = startParentContexts(lifeCycle, session)
  const urlContexts = startUrlContexts(lifeCycle, locationChangeObservable, location)
  const foregroundContexts = startForegroundContexts()

  let stopBatch: () => void

  if (isEventBridgePresent()) {
    startRumEventBridge(lifeCycle)
  } else {
    ;({ stop: stopBatch } = startRumBatch(configuration, lifeCycle))
  }

  startRumAssembly(applicationId, configuration, lifeCycle, session, parentContexts, urlContexts, getCommonContext)

  return {
    parentContexts,
    foregroundContexts,
    urlContexts,
    stop: () => {
      // prevent batch from previous tests to keep running and send unwanted requests
      // could be replaced by stopping all the component when they will all have a stop method
      stopBatch?.()
      parentContexts.stop()
      foregroundContexts.stop()
    },
  }
}
