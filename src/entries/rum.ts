import { Configuration, UserConfiguration } from '../core/configuration'
import { addGlobalContext } from '../core/context'
import { Observable } from '../core/observable'
import { ErrorMessage } from '../errorCollection/errorCollection'
import { startRum } from '../rum/rum'

import { buildInit } from './common'

export interface RUMUserConfiguration extends UserConfiguration {
  rumApplicationId: string
}

function postInit(
  userConfiguration: RUMUserConfiguration,
  configuration: Configuration,
  errorReporting: Observable<ErrorMessage>
) {
  if (!userConfiguration.rumApplicationId) {
    console.error('RUM application id is not configured, no RUM data will be collected')
    return
  }

  addGlobalContext('rumAppId', userConfiguration.rumApplicationId)

  startRum(errorReporting, configuration)
}

buildInit(postInit)
