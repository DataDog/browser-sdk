import { expect, use } from 'chai'
import * as sinon from 'sinon'
import sinonChai from 'sinon-chai'
import { Batch, HttpRequest } from '../transport'
import { noop } from '../utils'

use(sinonChai)

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

    expect(server.requests.length).equal(1)
    expect(server.requests[0].url).equal(ENDPOINT_URL)
    expect(server.requests[0].requestBody).equal('{"foo":"bar1"}\n{"foo":"bar2"}')
  })

  it('should use sendBeacon when the size is correct', () => {
    navigator.sendBeacon = (url: string, data: string) => true
    sinon.spy(navigator, 'sendBeacon')

    request.send('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

    expect(navigator.sendBeacon).called
  })

  it('should use xhr over sendBeacon when the size too high', () => {
    navigator.sendBeacon = (url: string, data: string) => true
    sinon.spy(navigator, 'sendBeacon')

    request.send('{"foo":"bar1"}\n{"foo":"bar2"}', BATCH_BYTES_LIMIT)

    expect(server.requests.length).equal(1)
    expect(server.requests[0].url).equal(ENDPOINT_URL)
    expect(server.requests[0].requestBody).equal('{"foo":"bar1"}\n{"foo":"bar2"}')
  })

  it('should fallback to xhr when sendBeacon is not queued', () => {
    navigator.sendBeacon = (url: string, data: string) => false
    sinon.spy(navigator, 'sendBeacon')

    request.send('{"foo":"bar1"}\n{"foo":"bar2"}', 10)

    expect(navigator.sendBeacon).called
    expect(server.requests.length).equal(1)
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
    sinon.spy(transport, 'send')
    batch = new Batch(transport, MAX_SIZE, BATCH_BYTES_LIMIT, MESSAGE_BYTES_LIMIT, FLUSH_TIMEOUT, () => CONTEXT)
  })

  it('should add context to message', () => {
    batch.add({ message: 'hello' })

    batch.flush()

    expect(transport.send).calledWith('{"foo":"bar","message":"hello"}')
  })

  it('should deep merge contexts', () => {
    CONTEXT.foo = { bar: 'qux' } as any
    batch.add({ message: 'hello', foo: { hello: 'qix' } })

    batch.flush()

    expect(transport.send).calledWith('{"foo":{"bar":"qux","hello":"qix"},"message":"hello"}')
  })

  it('should empty the batch after a flush', () => {
    batch.add({ message: 'hello' })

    batch.flush()
    ;(transport.send as sinon.SinonSpy).resetHistory()
    batch.flush()

    expect((transport.send as sinon.SinonSpy).notCalled).equal(true)
  })

  it('should flush when max size is reached', () => {
    batch.add({ message: '1' })
    batch.add({ message: '2' })
    batch.add({ message: '3' })
    expect(transport.send).calledWith(
      '{"foo":"bar","message":"1"}\n{"foo":"bar","message":"2"}\n{"foo":"bar","message":"3"}'
    )
  })

  it('should flush when new message will overflow bytes limit', () => {
    batch.add({ message: '50 bytes - xxxxxxxxxxxxx' })
    expect((transport.send as sinon.SinonSpy).notCalled).equal(true)

    batch.add({ message: '60 bytes - xxxxxxxxxxxxxxxxxxxxxxx' })
    expect(transport.send).calledWith('{"foo":"bar","message":"50 bytes - xxxxxxxxxxxxx"}', 50)

    batch.flush()
    expect(transport.send).calledWith('{"foo":"bar","message":"60 bytes - xxxxxxxxxxxxxxxxxxxxxxx"}', 60)
  })

  it('should consider separator size when computing the size', () => {
    batch.add({ message: '30 b' }) // batch: 30 sep: 0
    batch.add({ message: '30 b' }) // batch: 60 sep: 1
    batch.add({ message: '39 bytes - xx' }) // batch: 99 sep: 2

    expect(transport.send).calledWith('{"foo":"bar","message":"30 b"}\n{"foo":"bar","message":"30 b"}', 61)
  })

  it('should call send one time when the size is too high and the batch is empty', () => {
    const message = '101 bytes - xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
    batch.add({ message })
    expect(transport.send).calledWith(`{"foo":"bar","message":"${message}"}`, 101)
  })

  it('should flush the batch and send the message when the message is too heavy', () => {
    const message = '101 bytes - xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'

    batch.add({ message: '50 bytes - xxxxxxxxxxxxx' })
    batch.add({ message })
    expect((transport.send as sinon.SinonSpy).calledTwice).equal(true)
  })

  it('should flush after timeout', () => {
    const clock = sinon.useFakeTimers()
    batch = new Batch(transport, MAX_SIZE, BATCH_BYTES_LIMIT, MESSAGE_BYTES_LIMIT, 10, () => CONTEXT)
    batch.add({ message: '50 bytes - xxxxxxxxxxxxx' })
    clock.tick(100)

    expect((transport.send as sinon.SinonSpy).called).equal(true)

    clock.restore()
  })

  it('should not send a message with a size above the limit', () => {
    const warnStub = sinon.stub(console, 'warn')
    batch = new Batch(transport, MAX_SIZE, BATCH_BYTES_LIMIT, 50, FLUSH_TIMEOUT, () => CONTEXT)
    batch.add({ message: '50 bytes - xxxxxxxxxxxxx' })

    expect((transport.send as sinon.SinonSpy).called).equal(false)
    warnStub.restore()
  })

  it('should allow to add a custom message processor', () => {
    batch = new Batch(
      transport,
      MAX_SIZE,
      BATCH_BYTES_LIMIT,
      MESSAGE_BYTES_LIMIT,
      FLUSH_TIMEOUT,
      () => ({}),
      (message: { message: string }) => {
        message.message = `*** ${message.message} ***`
        return message
      }
    )

    batch.add({ message: 'hello' })
    batch.flush()

    expect(transport.send).calledWith(`{"message":"*** hello ***"}`)
  })
})
