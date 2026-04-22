import { Batch } from './batch'

describe('Batch', () => {
  it('should flush current batch and start a new one when max count is reached', () => {
    const messages: string[][] = []
    const batch = new Batch({ maxCount: 2, maxSizeBytes: Infinity, flushTimeoutMs: Infinity })
    batch.on('flush', (msgs) => messages.push(msgs))

    batch.add('event-1')
    batch.add('event-2')
    batch.add('event-3') // triggers flush of [event-1, event-2], event-3 goes to new batch

    expect(messages).toEqual([['event-1', 'event-2']])
  })

  it('should flush current batch and start a new one when max size is exceeded', () => {
    const messages: string[][] = []
    const batch = new Batch({ maxCount: Infinity, maxSizeBytes: 10, flushTimeoutMs: Infinity })
    batch.on('flush', (msgs) => messages.push(msgs))

    batch.add('hello') // 5 bytes — buffered
    batch.add('world!!') // 7 bytes — would exceed 10, flush first then add to new batch

    expect(messages).toEqual([['hello']])
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

    batch.add('event-1') // size 1 — buffered
    batch.add('event-2') // size 2 — buffered (at limit, not exceeded yet)
    batch.add('event-3') // would exceed 2 — flush first, then add event-3

    expect(messages).toEqual([['event-1', 'event-2']])
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

  it('should not flush after destroy', (done) => {
    const listener = jasmine.createSpy('flush')
    const batch = new Batch({ maxCount: Infinity, maxSizeBytes: Infinity, flushTimeoutMs: 20 })
    batch.on('flush', listener)

    batch.add('event-1')
    batch.destroy()

    setTimeout(() => {
      expect(listener).not.toHaveBeenCalled()
      done()
    }, 50)
  })

  describe('upsert', () => {
    it('replaces a previous message with the same key', () => {
      const messages: string[][] = []
      const batch = new Batch({ maxCount: Infinity, maxSizeBytes: Infinity, flushTimeoutMs: Infinity })
      batch.on('flush', (msgs) => messages.push(msgs))

      batch.upsert('view-1', 'view-state-1')
      batch.upsert('view-1', 'view-state-2')
      batch.add('other-event')
      batch.flush()

      expect(messages).toEqual([['view-state-2', 'other-event']])
    })

    it('counts size correctly after replacement', () => {
      const flushed: string[][] = []
      const batch = new Batch({ maxCount: Infinity, maxSizeBytes: 100, flushTimeoutMs: Infinity })
      batch.on('flush', (msgs) => flushed.push(msgs))

      batch.upsert('view-1', 'aaaa') // 4 bytes
      batch.upsert('view-1', 'bb') // replaces with 2 bytes — buffer should be 2 bytes, no flush

      expect(flushed).toEqual([])

      batch.flush()
      expect(flushed).toEqual([['bb']])
    })

    it('triggers flush when new key exceeds max size', () => {
      const flushed: string[][] = []
      const batch = new Batch({ maxCount: Infinity, maxSizeBytes: 5, flushTimeoutMs: Infinity })
      batch.on('flush', (msgs) => flushed.push(msgs))

      batch.add('hello') // 5 bytes — at limit
      batch.upsert('view-1', 'world!!') // 7 bytes, new key — should flush 'hello' first

      expect(flushed).toEqual([['hello']])
    })

    it('clears keyed entries on flush so second upsert starts fresh', () => {
      const flushed: string[][] = []
      const batch = new Batch({ maxCount: Infinity, maxSizeBytes: Infinity, flushTimeoutMs: Infinity })
      batch.on('flush', (msgs) => flushed.push(msgs))

      batch.upsert('view-1', 'first')
      batch.flush()

      batch.upsert('view-1', 'second') // new batch — should not replace, should append
      batch.flush()

      expect(flushed).toEqual([['first'], ['second']])
    })
  })
})
