import { Pipeline } from './pipeline'
import { stubFactory } from './testUtils'

describe('Pipeline', () => {
  describe('lifecycle', () => {
    it('should throw if publish() is called before seal()', () => {
      const pipeline = new Pipeline<{ foo: string }>()
      expect(() => pipeline.publish('foo', 'bar')).toThrowError(/sealed/)
    })

    it('should throw if decorate() is called after seal()', () => {
      const pipeline = new Pipeline<{ foo: string }>()
      pipeline.seal()
      expect(() => pipeline.decorate('foo', stubFactory({ name: 'test' }))).toThrowError(/sealed/)
    })

    it('should throw if seal() is called twice', () => {
      const pipeline = new Pipeline<{ foo: string }>()
      pipeline.seal()
      expect(() => pipeline.seal()).toThrowError(/already sealed/)
    })
  })

  describe('publish / subscribe (no decorators)', () => {
    it('should deliver event to subscriber', (done) => {
      const pipeline = new Pipeline<{ foo: string }>()
      pipeline.seal()
      pipeline.subscribe('foo', (value) => {
        expect(value).toBe('hello')
        done()
      })
      pipeline.publish('foo', 'hello')
    })

    it('should deliver to multiple subscribers', (done) => {
      const pipeline = new Pipeline<{ foo: number }>()
      pipeline.seal()
      let count = 0
      const check = () => {
        if (++count === 2) done()
      }
      pipeline.subscribe('foo', check)
      pipeline.subscribe('foo', check)
      pipeline.publish('foo', 42)
    })

    it('should not deliver to handler for a different event type', (done) => {
      const pipeline = new Pipeline<{ foo: string; bar: string }>()
      pipeline.seal()
      pipeline.subscribe('bar', () => {
        fail('should not be called')
      })
      pipeline.subscribe('foo', () => done())
      pipeline.publish('foo', 'x')
    })
  })

  describe('subscription cleanup', () => {
    it('should stop delivering after unsubscribe()', (done) => {
      const pipeline = new Pipeline<{ foo: string }>()
      pipeline.seal()
      let calls = 0
      const sub = pipeline.subscribe('foo', () => {
        calls++
      })
      sub.unsubscribe()
      pipeline.subscribe('foo', () => {
        expect(calls).toBe(0)
        done()
      })
      pipeline.publish('foo', 'x')
    })

    it('should only remove one registration when handler is registered twice and unsubscribed once', (done) => {
      const pipeline = new Pipeline<{ foo: string }>()
      pipeline.seal()
      let calls = 0
      const handler = () => {
        calls++
      }
      pipeline.subscribe('foo', handler)
      pipeline.subscribe('foo', handler)
      const sub = pipeline.subscribe('foo', handler) // third registration
      sub.unsubscribe() // removes one
      pipeline.subscribe('foo', () => {
        expect(calls).toBe(2) // two registrations remain
        done()
      })
      pipeline.publish('foo', 'x')
    })
  })

  describe('decorator DAG', () => {
    it('should deliver enriched event to subscriber', (done) => {
      type Events = { obs: { type: string; sessionId?: string } }
      const pipeline = new Pipeline<Events>()
      pipeline.decorate(
        'obs',
        stubFactory({
          name: 'session',
          provides: ['session'],
          create: () => ({
            decorate: async (_event: any, _accumulated: any) => ({
              status: 'contributed' as const,
              attributes: { sessionId: 'abc-123' },
            }),
          }),
        })
      )
      pipeline.seal()
      pipeline.subscribe('obs', (event) => {
        expect(event.sessionId).toBe('abc-123')
        done()
      })
      pipeline.publish('obs', { type: 'error' })
    })

    it('should drop event when decorator returns discarded', (done) => {
      type Events = { obs: { type: string }; other: string }
      const pipeline = new Pipeline<Events>()
      pipeline.decorate(
        'obs',
        stubFactory({
          name: 'consent',
          capabilities: { canDiscard: true },
          create: () => ({
            decorate: async () => ({ status: 'discarded' as const, reason: 'no consent' }),
          }),
        })
      )
      pipeline.seal()
      pipeline.subscribe('obs', () => {
        fail('should not be called for discarded event')
      })
      pipeline.subscribe('other', () => done())
      pipeline.publish('obs', { type: 'action' })
      pipeline.publish('other', 'ok')
    })

    it('should pass accumulated attributes to downstream decorators', (done) => {
      type Events = { obs: { type: string; sessionId?: string; viewId?: string } }
      const pipeline = new Pipeline<Events>()
      pipeline.decorate(
        'obs',
        stubFactory({
          name: 'session',
          provides: ['session'],
          create: () => ({
            decorate: async () => ({
              status: 'contributed' as const,
              attributes: { sessionId: 'sess-1' },
            }),
          }),
        })
      )
      pipeline.decorate(
        'obs',
        stubFactory({
          name: 'view',
          requires: ['session'],
          create: () => ({
            decorate: async (_event: any, accumulated: any) => {
              expect(accumulated.sessionId).toBe('sess-1')
              return { status: 'contributed' as const, attributes: { viewId: 'view-1' } }
            },
          }),
        })
      )
      pipeline.seal()
      pipeline.subscribe('obs', (event) => {
        expect(event.sessionId).toBe('sess-1')
        expect(event.viewId).toBe('view-1')
        done()
      })
      pipeline.publish('obs', { type: 'error' })
    })

    it('should process events sequentially (not concurrently)', (done) => {
      type Events = { obs: { type: string; order?: number } }
      const pipeline = new Pipeline<Events>()
      const processed: number[] = []
      pipeline.decorate(
        'obs',
        stubFactory({
          name: 'slow',
          create: () => ({
            decorate: async (event: any) => {
              await new Promise((r) => setTimeout(r, 10))
              processed.push(event.order)
              return { status: 'skipped' as const }
            },
          }),
        })
      )
      pipeline.seal()
      pipeline.subscribe('obs', () => {
        if (processed.length === 2) {
          expect(processed).toEqual([1, 2])
          done()
        }
      })
      pipeline.publish('obs', { type: 'x', order: 1 })
      pipeline.publish('obs', { type: 'x', order: 2 })
    })

    it('should continue processing after a decorator throws', (done) => {
      type Events = { obs: { type: string }; other: string }
      const pipeline = new Pipeline<Events>()
      pipeline.decorate(
        'obs',
        stubFactory({
          name: 'broken',
          create: () => ({
            decorate: async () => {
              throw new Error('decorator crashed')
            },
          }),
        })
      )
      pipeline.seal()
      pipeline.subscribe('obs', () => {
        fail('crashed event should not be delivered')
      })
      pipeline.subscribe('other', () => done())
      pipeline.publish('obs', { type: 'error' })
      pipeline.publish('other', 'ok')
    })
  })
})
