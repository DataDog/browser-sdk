import type { DeflateEncoderStreamId } from '@datadog/browser-core'
import { noop } from '@datadog/browser-core'
import type { CoreInitializeConfiguration } from '@datadog/browser-internal-next'
import { createDeflateEncoder, startDeflateWorker } from '@datadog/browser-rum/internal'

export function initialize(configuration: CoreInitializeConfiguration) {
  const deflateWorker = startDeflateWorker(
    configuration as any,
    'Datadog Session Replay',
    // Report worker creation failure?
    noop
  )
  if (!deflateWorker) {
    return
  }

  return {
    createEncoder: (streamId: DeflateEncoderStreamId) =>
      createDeflateEncoder(configuration as any, deflateWorker, streamId),
  }
}
