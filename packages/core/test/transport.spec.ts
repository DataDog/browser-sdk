import sinon from 'sinon'

import { Batch, HttpRequest } from '../src/transport'
import { noop } from '../src/utils'

describe('request', () => {
  const ENDPOINT_URL = 'http://my.website'
  const BATCH_BYTES_LIMIT = 100
  let server: sinon.SinonFakeServer
  let request: HttpRequest

  beforeEach(() => {
    server = sinon.fakeServer.create()
    request = new HttpRequest(ENDPOINT_URL, BATCH_BYTES_LIMIT)
  })

  afterEach(() => {
    server.restore()
  })

  it('should use xhr when sendBeacon is not defined', () => {
    request.send('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

    expect(server.requests.length).toEqual(1)
    expect(server.requests[0].url).toEqual(ENDPOINT_URL)
    expect(server.requests[0].requestBody).toEqual('{"foo":"bar1"}\n{"foo":"bar2"}')
  })

  it('should use sendBeacon when the size is correct', () => {
    spyOn(navigator, 'sendBeacon').and.callFake(() => true)

    request.send('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

    expect(navigator.sendBeacon).toHaveBeenCalled()
  })

  it('should use xhr over sendBeacon when the size too high', () => {
    spyOn(navigator, 'sendBeacon').and.callFake(() => true)

    request.send('{"foo":"bar1"}\n{"foo":"bar2"}', BATCH_BYTES_LIMIT)

    expect(server.requests.length).toEqual(1)
    expect(server.requests[0].url).toEqual(ENDPOINT_URL)
    expect(server.requests[0].requestBody).toEqual('{"foo":"bar1"}\n{"foo":"bar2"}')
  })

  it('should fallback to xhr when sendBeacon is not queued', () => {
    spyOn(navigator, 'sendBeacon').and.callFake(() => false)

    request.send('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

    expect(navigator.sendBeacon).toHaveBeenCalled()
    expect(server.requests.length).toEqual(1)
  })
})

describe('batch', () => {
  const MAX_SIZE = 3
  const BATCH_BYTES_LIMIT = 100
  const MESSAGE_BYTES_LIMIT = 50 * 1024
  let CONTEXT: { foo: string }
  const FLUSH_TIMEOUT = 60 * 1000
  let batch: Batch<{ message: string; foo?: any }>
  let transport: HttpRequest

  beforeEach(() => {
    CONTEXT = { foo: 'bar' }
    transport = ({ send: noop } as unknown) as HttpRequest
    spyOn(transport, 'send')
    batch = new Batch(transport, MAX_SIZE, BATCH_BYTES_LIMIT, MESSAGE_BYTES_LIMIT, FLUSH_TIMEOUT, () => CONTEXT)
  })

  it('should add context to message', () => {
    batch.add({ message: 'hello' })

    batch.flush()

    expect(transport.send).toHaveBeenCalledWith('{"foo":"bar","message":"hello"}', jasmine.any(Number))
  })

  it('should deep merge contexts', () => {
    CONTEXT.foo = { bar: 'qux' } as any
    batch.add({ message: 'hello', foo: { hello: 'qix' } })

    batch.flush()

    expect(transport.send).toHaveBeenCalledWith(
      '{"foo":{"bar":"qux","hello":"qix"},"message":"hello"}',
      jasmine.any(Number)
    )
  })

  it('should empty the batch after a flush', () => {
    batch.add({ message: 'hello' })

    batch.flush()
    ;(transport.send as jasmine.Spy).calls.reset()
    batch.flush()

    expect(transport.send).not.toHaveBeenCalled()
  })

  it('should calculate the byte size of message composed of 1 byte characters ', () => {
    expect(batch.sizeInBytes('1234')).toEqual(4)
  })

  it('should calculate the byte size of message composed of multiple bytes characters ', () => {
    expect(batch.sizeInBytes('🪐')).toEqual(4)
  })

  it('should flush when max size is reached', () => {
    batch.add({ message: '1' })
    batch.add({ message: '2' })
    batch.add({ message: '3' })
    expect(transport.send).toHaveBeenCalledWith(
      '{"foo":"bar","message":"1"}\n{"foo":"bar","message":"2"}\n{"foo":"bar","message":"3"}',
      jasmine.any(Number)
    )
  })

  it('should flush when new message will overflow bytes limit', () => {
    batch.add({ message: '50 bytes - xxxxxxxxxxxxx' })
    expect(transport.send).not.toHaveBeenCalled()

    batch.add({ message: '60 bytes - xxxxxxxxxxxxxxxxxxxxxxx' })
    expect(transport.send).toHaveBeenCalledWith('{"foo":"bar","message":"50 bytes - xxxxxxxxxxxxx"}', 50)

    batch.flush()
    expect(transport.send).toHaveBeenCalledWith('{"foo":"bar","message":"60 bytes - xxxxxxxxxxxxxxxxxxxxxxx"}', 60)
  })

  it('should consider separator size when computing the size', () => {
    batch.add({ message: '30 b' }) // batch: 30 sep: 0
    batch.add({ message: '30 b' }) // batch: 60 sep: 1
    batch.add({ message: '39 bytes - xx' }) // batch: 99 sep: 2

    expect(transport.send).toHaveBeenCalledWith('{"foo":"bar","message":"30 b"}\n{"foo":"bar","message":"30 b"}', 61)
  })

  it('should call send one time when the size is too high and the batch is empty', () => {
    const message = '101 bytes - xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
    batch.add({ message })
    expect(transport.send).toHaveBeenCalledWith(`{"foo":"bar","message":"${message}"}`, 101)
  })

  it('should flush the batch and send the message when the message is too heavy', () => {
    const message = '101 bytes - xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'

    batch.add({ message: '50 bytes - xxxxxxxxxxxxx' })
    batch.add({ message })
    expect(transport.send).toHaveBeenCalledTimes(2)
  })

  it('should flush after timeout', () => {
    const clock = sinon.useFakeTimers()
    batch = new Batch(transport, MAX_SIZE, BATCH_BYTES_LIMIT, MESSAGE_BYTES_LIMIT, 10, () => CONTEXT)
    batch.add({ message: '50 bytes - xxxxxxxxxxxxx' })
    clock.tick(100)

    expect(transport.send).toHaveBeenCalled()

    clock.restore()
  })

  it('should not send a message with a size above the limit', () => {
    const warnStub = sinon.stub(console, 'warn')
    batch = new Batch(transport, MAX_SIZE, BATCH_BYTES_LIMIT, 50, FLUSH_TIMEOUT, () => CONTEXT)
    batch.add({ message: '50 bytes - xxxxxxxxxxxxx' })

    expect(transport.send).not.toHaveBeenCalled()
    warnStub.restore()
  })

  it('should upsert a message for a given key', () => {
    batch.upsert({ message: '1' }, 'a')
    batch.upsert({ message: '2' }, 'a')
    batch.upsert({ message: '3' }, 'b')
    batch.upsert({ message: '4' }, 'c')

    expect(transport.send).toHaveBeenCalledWith(
      '{"foo":"bar","message":"2"}\n{"foo":"bar","message":"3"}\n{"foo":"bar","message":"4"}',
      jasmine.any(Number)
    )

    batch.upsert({ message: '5' }, 'c')
    batch.upsert({ message: '6' }, 'b')
    batch.upsert({ message: '7' }, 'a')

    expect(transport.send).toHaveBeenCalledWith(
      '{"foo":"bar","message":"5"}\n{"foo":"bar","message":"6"}\n{"foo":"bar","message":"7"}',
      jasmine.any(Number)
    )

    batch.upsert({ message: '8' }, 'a')
    batch.upsert({ message: '9' }, 'b')
    batch.upsert({ message: '10' }, 'a')
    batch.upsert({ message: '11' }, 'b')
    batch.flush()

    expect(transport.send).toHaveBeenCalledWith(
      '{"foo":"bar","message":"10"}\n{"foo":"bar","message":"11"}',
      jasmine.any(Number)
    )
  })
})
