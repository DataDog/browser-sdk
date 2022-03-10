import type { RumInitConfiguration } from '@datadog/browser-rum-core'
import { validateAndBuildRumConfiguration } from '@datadog/browser-rum-core'
import type { IpcMainEvent } from 'electron'
// eslint-disable-next-line local-rules/disallow-side-effects
import { ipcMain } from 'electron'
import { HttpRequest } from '../transport/httpRequest'
import { Batch } from '../transport/batch'
import { BRIDGE_CHANNEL, getElectronEventBridgeListener } from '../browser/eventBridge'
import { startRumSessionManager } from '../domain/session/rumSessionManager'

export async function startElectronRum(rumInitConfiguration: RumInitConfiguration): Promise<void> {
  const configuration = validateAndBuildRumConfiguration(rumInitConfiguration)!
  const sessionManager = await startRumSessionManager(configuration)
  const rumBatch = new Batch(
    new HttpRequest(configuration.rumEndpointBuilder),
    configuration.maxBatchSize,
    configuration.batchBytesLimit,
    configuration.maxMessageSize,
    configuration.flushTimeout
  )
  const internalMonitoringBatch = configuration.internalMonitoringEndpointBuilder
    ? new Batch(
        new HttpRequest(configuration.internalMonitoringEndpointBuilder),
        configuration.maxBatchSize,
        configuration.batchBytesLimit,
        configuration.maxMessageSize,
        configuration.flushTimeout
      )
    : undefined
  const ipcEventBridgeForwarder = getElectronEventBridgeListener(
    sessionManager,
    configuration.applicationId,
    rumBatch,
    internalMonitoringBatch
  )
  ipcMain.on(BRIDGE_CHANNEL, (_event: IpcMainEvent, arg) => {
    ipcEventBridgeForwarder(arg)
  })
}
