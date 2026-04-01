import { Batch } from './batch'

describe('Batch', () => {
  it('should emit flush with messages when max count is reached', () => {
    const messages: string[][] = []
    const batch = new Batch({ maxCount: 2, maxSizeBytes: Infinity, flushTimeoutMs: Infinity })
    batch.on('flush', (msgs) => messages.push(msgs))

    batch.add('event-1')
    batch.add('event-2')

    expect(messages).toEqual([['event-1', 'event-2']])
  })

  it('should emit flush with messages when max size is exceeded', () => {
    const messages: string[][] = []
    const batch = new Batch({ maxCount: Infinity, maxSizeBytes: 10, flushTimeoutMs: Infinity })
    batch.on('flush', (msgs) => messages.push(msgs))

    batch.add('hello') // 5 bytes
    batch.add('world!!') // 7 bytes — exceeds 10

    expect(messages).toEqual([['hello', 'world!!']])
  })

  it('should emit flush on manual flush call', () => {
    const messages: string[][] = []
    const batch = new Batch({ maxCount: Infinity, maxSizeBytes: Infinity, flushTimeoutMs: Infinity })
    batch.on('flush', (msgs) => messages.push(msgs))

    batch.add('event-1')
    batch.flush()

    expect(messages).toEqual([['event-1']])
  })

  it('should not emit flush when nothing is buffered', () => {
    const listener = jasmine.createSpy('listener')
    const batch = new Batch({ maxCount: Infinity, maxSizeBytes: Infinity, flushTimeoutMs: Infinity })
    batch.on('flush', listener)

    batch.flush()

    expect(listener).not.toHaveBeenCalled()
  })

  it('should clear buffer after flush', () => {
    const messages: string[][] = []
    const batch = new Batch({ maxCount: Infinity, maxSizeBytes: Infinity, flushTimeoutMs: Infinity })
    batch.on('flush', (msgs) => messages.push(msgs))

    batch.add('event-1')
    batch.flush()
    batch.flush()

    expect(messages).toEqual([['event-1']])
  })

  it('should use custom message size function', () => {
    const messages: string[][] = []
    const batch = new Batch({
      maxCount: Infinity,
      maxSizeBytes: 2,
      flushTimeoutMs: Infinity,
      getMessageSize: () => 1,
    })
    batch.on('flush', (msgs) => messages.push(msgs))

    batch.add('event-1')
    batch.add('event-2')
    batch.add('event-3')

    expect(messages).toEqual([['event-1', 'event-2', 'event-3']])
  })

  it('should emit flush after timeout', (done) => {
    const messages: string[][] = []
    const batch = new Batch({ maxCount: Infinity, maxSizeBytes: Infinity, flushTimeoutMs: 20 })
    batch.on('flush', (msgs) => messages.push(msgs))

    batch.add('event-1')

    setTimeout(() => {
      expect(messages).toEqual([['event-1']])
      done()
    }, 50)
  })
})
