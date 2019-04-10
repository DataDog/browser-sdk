import { Configuration, UserConfiguration } from '../core/configuration'
import { addGlobalContext } from '../core/context'
import { ErrorObservable } from '../errorCollection/errorCollection'
import { startRum } from '../rum/rum'

import { buildInit } from './common'

export interface RUMUserConfiguration extends UserConfiguration {
  rumApplicationId: string
}

function postInit(
  userConfiguration: RUMUserConfiguration,
  configuration: Configuration,
  errorObservable: ErrorObservable
) {
  if (!userConfiguration.rumApplicationId) {
    console.error('RUM application id is not configured, no RUM data will be collected')
    return
  }

  addGlobalContext('rumAppId', userConfiguration.rumApplicationId)

  startRum(errorObservable, configuration)
}

buildInit(postInit)
