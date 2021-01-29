import { combine, commonInit, Configuration } from '@datadog/browser-core'
import { startDOMMutationCollection } from '../browser/domMutationCollection'
import { startPerformanceCollection } from '../browser/performanceCollection'
import { startRumAssembly } from '../domain/assembly'
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

import { buildEnv } from './buildEnv'
import { RumUserConfiguration } from './rumPublicApi'

export function startRum(userConfiguration: RumUserConfiguration, getCommonContext: () => CommonContext) {
  const lifeCycle = new LifeCycle()

  const { configuration, internalMonitoring } = commonInit(userConfiguration, buildEnv)
  const session = startRumSession(configuration, lifeCycle)

  internalMonitoring.setExternalContextProvider(() =>
    combine(
      {
        application_id: userConfiguration.applicationId,
      },
      parentContexts.findView(),
      getCommonContext().context
    )
  )

  const { parentContexts, addError, addAction, addTiming } = startRumEventCollection(
    userConfiguration.applicationId,
    location,
    lifeCycle,
    configuration,
    session,
    getCommonContext
  )

  startRequestCollection(lifeCycle, configuration)
  startPerformanceCollection(lifeCycle, configuration)
  startDOMMutationCollection(lifeCycle)

  const internalContext = startInternalContext(userConfiguration.applicationId, session, parentContexts)

  return {
    addAction,
    addError,
    addTiming,
    configuration,
    lifeCycle,
    parentContexts,
    session,
    getInternalContext: internalContext.get,
  }
}

export function startRumEventCollection(
  applicationId: string,
  location: Location,
  lifeCycle: LifeCycle,
  configuration: Configuration,
  session: RumSession,
  getCommonContext: () => CommonContext
) {
  const parentContexts = startParentContexts(lifeCycle, session)
  const batch = startRumBatch(configuration, lifeCycle)
  startRumAssembly(applicationId, configuration, lifeCycle, session, parentContexts, getCommonContext)
  startLongTaskCollection(lifeCycle)
  startResourceCollection(lifeCycle, configuration, session)
  const { addTiming } = startViewCollection(lifeCycle, configuration, location)
  const { addError } = startErrorCollection(lifeCycle, configuration)
  const { addAction } = startActionCollection(lifeCycle, configuration)

  return {
    addAction,
    addError,
    parentContexts,

    addTiming,

    stop() {
      // prevent batch from previous tests to keep running and send unwanted requests
      // could be replaced by stopping all the component when they will all have a stop method
      batch.stop()
    },
  }
}
