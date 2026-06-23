import type { Encoder } from '@openobserve/browser-core'
import { DeflateEncoderStreamId } from '@openobserve/browser-core'
import type { LifeCycle, RumConfiguration, TransportPayload } from '@openobserve/browser-rum-core'
import { createFormDataTransport } from '@openobserve/browser-rum-core'
import type { ProfilingPayload } from '../types'

export function createFormDataEmitter(
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  createEncoder: (streamId: DeflateEncoderStreamId) => Encoder
): (payload: ProfilingPayload) => void {
  const transport = createFormDataTransport(configuration, lifeCycle, createEncoder, DeflateEncoderStreamId.PROFILING)
  return ({ profile, trace }: ProfilingPayload) => {
    const formPayload = { event: profile, 'wall-time.json': trace }
    void transport.send(formPayload as unknown as TransportPayload)
  }
}
