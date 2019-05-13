import { Configuration, UserConfiguration } from '../core/configuration'
import { ErrorObservable } from '../logs/errorCollection'
import { startRum } from './rum'

import { buildInit } from '../core/init'

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

  startRum(userConfiguration.rumProjectId, errorObservable, configuration)
}

buildInit(postInit)
