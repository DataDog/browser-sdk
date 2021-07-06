import { combine, Configuration, InternalMonitoring } from '@datadog/browser-core'
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
import { RumSession, startRumSession } from '../domain/rumSession'
import { CommonContext } from '../rawRumEvent.types'
import { startRumBatch } from '../transport/batch'
import { RumInitConfiguration } from './rumPublicApi'

export function startRum(
  initConfiguration: RumInitConfiguration,
  configuration: Configuration,
  internalMonitoring: InternalMonitoring,
  getCommonContext: () => CommonContext,
  initialViewName?: string
) {
  const lifeCycle = new LifeCycle()
  const session = startRumSession(configuration, lifeCycle)
  const domMutationObservable = createDOMMutationObservable()

  internalMonitoring.setExternalContextProvider(() =>
    combine(
      {
        application_id: initConfiguration.applicationId,
      },
      parentContexts.findView(),
      getCommonContext().context
    )
  )

  const { parentContexts, foregroundContexts } = startRumEventCollection(
    initConfiguration.applicationId,
    lifeCycle,
    configuration,
    session,
    getCommonContext
  )

  startLongTaskCollection(lifeCycle)
  startResourceCollection(lifeCycle, session)
  const { addTiming, startView } = startViewCollection(
    lifeCycle,
    configuration,
    location,
    domMutationObservable,
    foregroundContexts,
    initialViewName
  )
  const { addError } = startErrorCollection(lifeCycle, configuration, foregroundContexts)
  const { addAction } = startActionCollection(lifeCycle, domMutationObservable, configuration, foregroundContexts)

  startRequestCollection(lifeCycle, configuration)
  startPerformanceCollection(lifeCycle, configuration)

  const internalContext = startInternalContext(initConfiguration.applicationId, session, parentContexts)

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
  session: RumSession,
  getCommonContext: () => CommonContext
) {
  const parentContexts = startParentContexts(lifeCycle, session)
  const foregroundContexts = startForegroundContexts(configuration)
  const batch = startRumBatch(configuration, lifeCycle)

  startRumAssembly(applicationId, configuration, lifeCycle, session, parentContexts, getCommonContext)

  return {
    parentContexts,
    foregroundContexts,
    stop: () => {
      // prevent batch from previous tests to keep running and send unwanted requests
      // could be replaced by stopping all the component when they will all have a stop method
      batch.stop()
      parentContexts.stop()
      foregroundContexts.stop()
    },
  }
}
