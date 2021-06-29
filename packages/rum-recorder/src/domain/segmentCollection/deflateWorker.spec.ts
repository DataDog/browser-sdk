import { createDeflateWorker, DeflateWorker, DeflateWorkerResponse } from './deflateWorker'

describe('deflateWorker', () => {
  it('buffers data and responds with the buffer deflated size when writing', (done) => {
    const deflateWorker = createDeflateWorker()
    listen(deflateWorker, 3, (events) => {
      expect(events).toEqual([
        { id: 0, size: 11 },
        { id: 1, size: 20 },
        { id: 2, size: 29 },
      ])
      done()
    })
    deflateWorker.postMessage({ id: 0, action: 'write', data: 'foo' })
    deflateWorker.postMessage({ id: 1, action: 'write', data: 'bar' })
    deflateWorker.postMessage({ id: 2, action: 'write', data: 'baz' })
  })

  it('responds with the resulting bytes when completing', (done) => {
    const deflateWorker = createDeflateWorker()
    listen(deflateWorker, 2, (events) => {
      expect(events).toEqual([
        { id: 0, size: 11 },
        {
          id: 1,
          result: new Uint8Array([120, 156, 74, 203, 207, 7, 0, 0, 0, 255, 255, 3, 0, 2, 130, 1, 69]),
          sizeInBytes: 3,
        },
      ])
      done()
    })
    deflateWorker.postMessage({ id: 0, action: 'write', data: 'foo' })
    deflateWorker.postMessage({ id: 1, action: 'flush' })
  })

  it('writes the remaining data specified by "flush"', (done) => {
    const deflateWorker = createDeflateWorker()
    listen(deflateWorker, 1, (events) => {
      expect(events).toEqual([
        {
          id: 0,
          result: new Uint8Array([120, 156, 74, 203, 207, 7, 0, 0, 0, 255, 255, 3, 0, 2, 130, 1, 69]),
          sizeInBytes: 3,
        },
      ])
      done()
    })
    deflateWorker.postMessage({ id: 0, action: 'flush', data: 'foo' })
  })

  it('flushes several deflates one after the other', (done) => {
    const deflateWorker = createDeflateWorker()
    listen(deflateWorker, 4, (events) => {
      expect(events).toEqual([
        {
          id: 0,
          size: 11,
        },
        {
          id: 1,
          result: new Uint8Array([120, 156, 74, 203, 207, 7, 0, 0, 0, 255, 255, 3, 0, 2, 130, 1, 69]),
          sizeInBytes: 3,
        },
        {
          id: 2,
          size: 11,
        },
        {
          id: 3,
          result: new Uint8Array([120, 156, 74, 74, 44, 2, 0, 0, 0, 255, 255, 3, 0, 2, 93, 1, 54]),
          sizeInBytes: 3,
        },
      ])
      done()
    })
    deflateWorker.postMessage({ id: 0, action: 'write', data: 'foo' })
    deflateWorker.postMessage({ id: 1, action: 'flush' })
    deflateWorker.postMessage({ id: 2, action: 'write', data: 'bar' })
    deflateWorker.postMessage({ id: 3, action: 'flush' })
  })

  function listen(
    deflateWorker: DeflateWorker,
    expectedResponseCount: number,
    onDone: (responses: DeflateWorkerResponse[]) => void
  ) {
    const responses: DeflateWorkerResponse[] = []
    const listener = (event: { data: DeflateWorkerResponse }) => {
      const responsesCount = responses.push(event.data)
      if (responsesCount === expectedResponseCount) {
        deflateWorker.removeEventListener('message', listener)
        onDone(responses)
      }
    }
    deflateWorker.addEventListener('message', listener)
  }
})
