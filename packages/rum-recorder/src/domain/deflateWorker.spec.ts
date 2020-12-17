import { createDeflateWorker, DeflateWorker, DeflateWorkerResponse } from './deflateWorker'

describe('deflateWorker', () => {
  it('responds with the deflated size when pushing some data', (done) => {
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
        },
      ])
      done()
    })
    deflateWorker.postMessage({ id: 0, action: 'write', data: 'foo' })
    deflateWorker.postMessage({ id: 1, action: 'complete' })
  })

  it('pushes the remaining data specified by "complete"', (done) => {
    const deflateWorker = createDeflateWorker()
    listen(deflateWorker, 1, (events) => {
      expect(events).toEqual([
        {
          id: 0,
          result: new Uint8Array([120, 156, 74, 203, 207, 7, 0, 0, 0, 255, 255, 3, 0, 2, 130, 1, 69]),
        },
      ])
      done()
    })
    deflateWorker.postMessage({ id: 0, action: 'complete', data: 'foo' })
  })

  function listen(
    deflateWorker: DeflateWorker,
    expectedResponseCount: number,
    onComplete: (responses: DeflateWorkerResponse[]) => void
  ) {
    const responses: DeflateWorkerResponse[] = []
    const listener = (event: { data: DeflateWorkerResponse }) => {
      const responsesCount = responses.push(event.data)
      if (responsesCount === expectedResponseCount) {
        deflateWorker.removeEventListener('message', listener)
        onComplete(responses)
      }
    }
    deflateWorker.addEventListener('message', listener)
  }
})
