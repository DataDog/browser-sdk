import { UserConfiguration } from '../core/configuration'
import { addGlobalContext } from '../core/context'
import { Logger } from '../core/logger'
import { Observable } from '../core/observable'
import { Batch } from '../core/transport'
import { ErrorMessage } from '../errorCollection/errorCollection'
import { startRum } from '../rum/rum'

import { buildInit } from './common'

export interface RUMUserConfiguration extends UserConfiguration {
  rumApplicationId: string
}

function postInit(
  userConfiguration: RUMUserConfiguration,
  errorReporting: Observable<ErrorMessage>,
  batch: Batch,
  logger: Logger
) {
  if (!userConfiguration.rumApplicationId) {
    console.error('RUM application id is not configured, no RUM data will be collected')
    return
  }

  addGlobalContext('rumAppId', userConfiguration.rumApplicationId)

  startRum(errorReporting, batch, logger)
}

buildInit(postInit)
