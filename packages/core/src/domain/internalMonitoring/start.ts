import { combine, Context } from '../../tools/context'
import * as utils from '../../tools/utils'
import { Batch, HttpRequest } from '../../transport/transport'
import { Configuration } from '../configuration'
import { monitoringConfiguration } from './configuration'
import type { MonitoringMessage } from './monitor'

export interface InternalMonitoring {
  setExternalContextProvider: (provider: () => Context) => void
}

let externalContextProvider: () => Context

export function startInternalMonitoring(configuration: Configuration): InternalMonitoring {
  if (configuration.internalMonitoringEndpoint) {
    const batch = startMonitoringBatch(configuration)

    utils.assign(monitoringConfiguration, {
      batch,
      maxMessagesPerPage: configuration.maxInternalMonitoringMessagesPerPage,
      sentMessageCount: 0,
    })
  }
  return {
    setExternalContextProvider: (provider: () => Context) => {
      externalContextProvider = provider
    },
  }
}

function startMonitoringBatch(configuration: Configuration) {
  const primaryBatch = createMonitoringBatch(configuration.internalMonitoringEndpoint!)
  let replicaBatch: Batch | undefined
  if (configuration.replica !== undefined) {
    replicaBatch = createMonitoringBatch(configuration.replica.internalMonitoringEndpoint)
  }

  function createMonitoringBatch(endpointUrl: string) {
    return new Batch(
      new HttpRequest(endpointUrl, configuration.batchBytesLimit),
      configuration.maxBatchSize,
      configuration.batchBytesLimit,
      configuration.maxMessageSize,
      configuration.flushTimeout
    )
  }

  function withContext(message: MonitoringMessage) {
    return combine(
      {
        date: new Date().getTime(),
        view: {
          referrer: document.referrer,
          url: window.location.href,
        },
      },
      externalContextProvider !== undefined ? externalContextProvider() : {},
      message
    )
  }

  return {
    add(message: MonitoringMessage) {
      const contextualizedMessage = withContext(message)
      primaryBatch.add(contextualizedMessage)
      if (replicaBatch) {
        replicaBatch.add(contextualizedMessage)
      }
    },
  }
}

export function resetInternalMonitoring() {
  monitoringConfiguration.batch = undefined
}

export function setDebugMode(debugMode: boolean) {
  monitoringConfiguration.debugMode = debugMode
}
