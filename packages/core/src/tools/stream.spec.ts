import { isIE } from './browserDetection'
import { readLimitedAmountOfBytes } from './stream'

const stringChunk = 'helloWord'
const limit = 3

describe('stream', () => {
  it('call callback once limit is reached', (done) => {
    if (isIE()) {
      pending('IE not supported')
    }
    const stream = new ReadableStream({
      start(controller) {
        setTimeout(() => {
          controller.enqueue(stringChunk)
          controller.close()
        }, 0)
      },
    })

    const spy = jasmine.createSpy()
    readLimitedAmountOfBytes(stream, limit, spy)
    setTimeout(() => {
      expect(spy).toHaveBeenCalled()
      expect(spy).toHaveBeenCalledWith(undefined, stringChunk.substring(0, limit), jasmine.any(Boolean))
      done()
    })
  })

  it('call callback with error', (done) => {
    if (isIE()) {
      pending('IE not supported')
    }
    const fakeError = 'fakeError'
    const stream = new ReadableStream({
      start(controller) {
        controller.error(fakeError)
      },
    })

    const spy = jasmine.createSpy()
    readLimitedAmountOfBytes(stream, limit, spy)
    setTimeout(() => {
      expect(spy).toHaveBeenCalled()
      expect(spy).toHaveBeenCalledWith(fakeError)
      done()
    })
  })

  it('call callback with empty buffer if shouldStoreChunks false', (done) => {
    if (isIE()) {
      pending('IE not supported')
    }
    const stream = new ReadableStream({
      start(controller) {
        setTimeout(() => {
          controller.enqueue(stringChunk)
          controller.close()
        }, 0)
      },
    })

    const spy = jasmine.createSpy()
    readLimitedAmountOfBytes(stream, limit, spy, false)
    setTimeout(() => {
      expect(spy).toHaveBeenCalled()
      done()
    })
  })
})
