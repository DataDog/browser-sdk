import { combine, commonInit, Configuration, Context } from '@datadog/browser-core'
import { startDOMMutationCollection } from '../browser/domMutationCollection'
import { startPerformanceCollection } from '../browser/performanceCollection'
import { startRumAssembly } from '../domain/assembly'
import { startRumAssemblyV2 } from '../domain/assemblyV2'
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
import { startRumBatch } from '../transport/batch'
import { GlobalAttributes } from '../typesV2'

import { buildEnv } from './buildEnv'
import { RumUserConfiguration } from './rum.entry'

export function startRum(userConfiguration: RumUserConfiguration, getGlobalAttributes: () => GlobalAttributes) {
  const lifeCycle = new LifeCycle()

  const { configuration, internalMonitoring } = commonInit(userConfiguration, buildEnv)
  const session = startRumSession(configuration, lifeCycle)

  internalMonitoring.setExternalContextProvider(() => {
    return combine(
      {
        application_id: userConfiguration.applicationId,
      },
      parentContexts.findView(),
      getGlobalAttributes().context
    )
  })

  const { parentContexts, addError, addAction } = startRumEventCollection(
    userConfiguration.applicationId,
    location,
    lifeCycle,
    configuration,
    session,
    getGlobalAttributes
  )

  startRequestCollection(lifeCycle, configuration)
  startPerformanceCollection(lifeCycle, configuration)
  startDOMMutationCollection(lifeCycle)

  const internalContext = startInternalContext(userConfiguration.applicationId, session, parentContexts, configuration)

  return {
    addAction,
    addError,
    getInternalContext: internalContext.get,
  }
}

export function startRumEventCollection(
  applicationId: string,
  location: Location,
  lifeCycle: LifeCycle,
  configuration: Configuration,
  session: RumSession,
  getGlobalAttributes: () => GlobalAttributes
) {
  const parentContexts = startParentContexts(lifeCycle, session)
  const batch = startRumBatch(configuration, lifeCycle)
  startRumAssembly(
    applicationId,
    configuration,
    lifeCycle,
    session,
    parentContexts,
    () => getGlobalAttributes().context
  )
  startRumAssemblyV2(applicationId, configuration, lifeCycle, session, parentContexts, getGlobalAttributes)
  startLongTaskCollection(lifeCycle, configuration)
  startResourceCollection(lifeCycle, configuration, session)
  startViewCollection(lifeCycle, configuration, location)
  const { addError } = startErrorCollection(lifeCycle, configuration)
  const { addAction } = startActionCollection(lifeCycle, configuration)

  return {
    addAction,
    addError,
    parentContexts,

    stop() {
      // prevent batch from previous tests to keep running and send unwanted requests
      // could be replaced by stopping all the component when they will all have a stop method
      batch.stop()
    },
  }
}
