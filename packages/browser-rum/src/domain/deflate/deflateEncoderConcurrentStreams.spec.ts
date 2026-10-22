import type { EncoderResult } from '@datadog/browser-core'
import type { Uint8ArrayBuffer } from '@datadog/js-core/util'
import { DeflateEncoderStreamId } from '@datadog/browser-core'
import { MockWorker } from '../../../test'
import { createDeflateEncoder } from './deflateEncoder'

// Regression specs for the web-worker profiling transports (PROF-15093): the
// main-thread profiler and the worker-profiling coordinator both send profiles
// concurrently through encoders sharing a single deflate worker. Encoder
// response routing is keyed by stream id, and each encoder's write-action ids
// restart at 0, so two transports MUST use distinct stream ids — sharing one
// cross-delivers compressed chunks and can silently hang one transport.
describe('createDeflateEncoder — concurrent encoders on distinct stream ids', () => {
  it('delivers each transport its own data when sends overlap', () => {
    const worker = new MockWorker()
    const mainTransport = createDeflateEncoder(worker, DeflateEncoderStreamId.PROFILING)
    const workerTransport = createDeflateEncoder(worker, DeflateEncoderStreamId.WORKER_PROFILING)

    const mainGot: Array<EncoderResult<Uint8ArrayBuffer>> = []
    const workerGot: Array<EncoderResult<Uint8ArrayBuffer>> = []

    mainTransport.write('main-trace')
    workerTransport.write('worker-trace')
    worker.processAllMessages()

    mainTransport.finish((result) => mainGot.push(result))
    workerTransport.finish((result) => workerGot.push(result))
    worker.processAllMessages()

    expect(new TextDecoder().decode(mainGot[0].output)).toContain('main-trace')
    expect(new TextDecoder().decode(workerGot[0].output)).toContain('worker-trace')
  })

  it('resolves finish when a higher-id response arrives while the worker transport has a pending low-id write', () => {
    const worker = new MockWorker()
    const mainTransport = createDeflateEncoder(worker, DeflateEncoderStreamId.PROFILING)
    const workerTransport = createDeflateEncoder(worker, DeflateEncoderStreamId.WORKER_PROFILING)

    // Main transport has already sent two profiles (write ids 0, 1 consumed).
    mainTransport.write('main-1')
    worker.processAllMessages()
    mainTransport.finish(() => undefined)
    worker.processAllMessages()
    mainTransport.write('main-2')
    worker.processAllMessages()
    mainTransport.finish(() => undefined)
    worker.processAllMessages()

    // Post main's write FIRST so its response arrives before the worker's
    // (MockWorker processes FIFO). The worker transport's pending write (its
    // first, id 0) is still queued behind main's higher-id write. With a
    // shared stream id, main's response (id 2) would trigger the 'out of
    // order' guard (0 < 2) and remove the worker transport's listener,
    // permanently hanging its sends. With distinct ids it must resolve.
    mainTransport.write('main-3')
    workerTransport.write('worker-1')
    worker.processAllMessages()

    const finishSpy = jasmine.createSpy('finish')
    workerTransport.finish(finishSpy)
    worker.processAllMessages()

    expect(finishSpy).toHaveBeenCalledTimes(1)
  })
})
