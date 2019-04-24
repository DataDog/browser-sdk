import { Configuration, UserConfiguration } from '../core/configuration'
import { addLoggerGlobalContext } from '../core/context'
import { ErrorObservable } from '../errorCollection/errorCollection'
import { startRum } from '../rum/rum'

import { buildInit } from './common'

export interface RUMUserConfiguration extends UserConfiguration {
  rumProjectId: string
}

function postInit(
  userConfiguration: RUMUserConfiguration,
  configuration: Configuration,
  errorObservable: ErrorObservable
) {
  if (!userConfiguration.rumProjectId) {
    console.error('RUM project id is not configured, no RUM data will be collected')
    return
  }

  addLoggerGlobalContext('rumProjectId', userConfiguration.rumProjectId)

  startRum(errorObservable, configuration)
}

buildInit(postInit)
