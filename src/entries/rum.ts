import { UserConfiguration } from '../core/configuration'
import { addGlobalContext } from '../core/context'
import { Logger } from '../core/logger'
import { Batch } from '../core/transport'
import { startRum } from '../rum/rum'

import { buildInit } from './common'

export interface RUMUserConfiguration extends UserConfiguration {
  rumApplicationId: string
}

function postInit(userConfiguration: RUMUserConfiguration, batch: Batch, logger: Logger) {
  if (!userConfiguration.rumApplicationId) {
    console.error('RUM application id is not configured, no RUM data will be collected')
  }

  addGlobalContext('rum_app_id', userConfiguration.rumApplicationId)

  startRum(batch, logger)
}

buildInit(postInit)
