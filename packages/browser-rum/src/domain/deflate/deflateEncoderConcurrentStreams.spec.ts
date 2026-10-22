import type { EncoderResult } from '@datadog/browser-core'
import type { Uint8ArrayBuffer } from '@datadog/js-core/util'
import { DeflateEncoderStreamId } from '@datadog/browser-core'
import { MockWorker } from '../../../test'
import { createDeflateEncoder } from './deflateEncoder'

/**
 * Regression specs for the web-worker profiling transports (PROF-15093): the
 * main-thread profiler (formDataEmitter) and the worker-profiling coordinator
 * both send profiles concurrently — e.g. both flush on the same
 * visibilitychange / beforeunload event — through encoders sharing a single
 * deflate worker. Encoder response routing is keyed by stream id, and each
 * encoder's write-action ids restart at 0, so two transports MUST use distinct
 * stream ids: sharing one makes the first response match BOTH encoders'
 * pending actions, cross-delivering compressed chunks (both transports send
 * the same attachment bytes) and, once ids diverge, making one encoder treat
 * the other's response as out-of-order and silently drop its own listener
 * (its sends then hang forever).
 */
describe('createDeflateEncoder — concurrent encoders on distinct stream ids', () => {
  it('delivers each transport its own data when sends overlap', () => {
    const worker = new MockWorker()
    const mainTransport = createDeflateEncoder(worker, DeflateEncoderStreamId.PROFILING)
    const workerTransport = createDeflateEncoder(worker, DeflateEncoderStreamId.WORKER_PROFILING)

    const mainGot: Array<EncoderResult<Uint8ArrayBuffer>> = []
    const workerGot: Array<EncoderResult<Uint8ArrayBuffer>> = []

    // Both transports have a pending write at the same time (concurrent flush).
    mainTransport.write('main-trace')
    workerTransport.write('worker-trace')
    worker.processAllMessages()

    mainTransport.finish((result) => mainGot.push(result))
    workerTransport.finish((result) => workerGot.push(result))
    worker.processAllMessages()

    expect(new TextDecoder().decode(mainGot[0].output)).toContain('main-trace')
    expect(new TextDecoder().decode(workerGot[0].output)).toContain('worker-trace')
  })

  it('resolves finish even when the other transport has sent profiles before', () => {
    const worker = new MockWorker()
    const mainTransport = createDeflateEncoder(worker, DeflateEncoderStreamId.PROFILING)
    const workerTransport = createDeflateEncoder(worker, DeflateEncoderStreamId.WORKER_PROFILING)

    // The main transport has already sent two profiles (write ids 0, 1).
    mainTransport.write('main-1')
    worker.processAllMessages()
    mainTransport.finish(() => undefined)
    worker.processAllMessages()
    mainTransport.write('main-2')
    worker.processAllMessages()
    mainTransport.finish(() => undefined)
    worker.processAllMessages()

    // The worker transport sends for the first time — its id counter restarts
    // at 0, so main's next response id is higher. With a shared stream id this
    // would trip the 'out of order' guard and kill the worker transport's
    // listener; with distinct ids it must resolve normally.
    workerTransport.write('worker-1')
    worker.processAllMessages()

    const finishSpy = jasmine.createSpy('finish')
    workerTransport.finish(finishSpy)
    worker.processAllMessages()

    expect(finishSpy).toHaveBeenCalledTimes(1)
  })
})
