import { UserConfiguration } from '../core/configuration'
import { addGlobalContext } from '../core/context'
import { Logger } from '../core/logger'
import { batch as monitorBatch } from '../core/monitoring'
import { Batch } from '../core/transport'
import { startRum } from '../rum/rum'

import { buildInit } from './common'
import { RUMUserConfiguration } from './rum'

interface E2EUserConfiguration extends RUMUserConfiguration {
  logsEndpoint: string
  monitoringEndpoint: string
  rumApplicationId: string
}

function postInit(userConfiguration: E2EUserConfiguration, batch: Batch, logger: Logger) {
  addGlobalContext('rum_app_id', userConfiguration.rumApplicationId)
  startRum(batch, logger)
  // We don't want to expose the possibility to override endpoints to the user but we
  // need it for our E2E tests, so let's make a dedicated bundle where we manually
  // override the given endpoints.
  // tslint:disable:no-string-literal
  batch['request']['endpointUrl'] = userConfiguration.logsEndpoint
  if (monitorBatch) {
    monitorBatch['request']['endpointUrl'] = userConfiguration.monitoringEndpoint
  }
}

buildInit(postInit)
