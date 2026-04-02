import { Pipeline } from './pipeline'
import { enricher as createEnricher, DISCARD } from '../enricher'
import type { AnyEnricher } from '../enricher'

describe('Pipeline', () => {
  describe('lifecycle', () => {
    it('should buffer events published before seal() and deliver them after sealing', (done) => {
      const pipeline = new Pipeline<{ foo: string }>()
      pipeline.subscribe('foo', (value) => {
        expect(value).toBe('buffered')
        done()
      })
      pipeline.publish('foo', 'buffered')
      pipeline.seal()
    })

    it('should deliver pre-seal and post-seal events in order', (done) => {
      const pipeline = new Pipeline<{ foo: number }>()
      const received: number[] = []
      pipeline.subscribe('foo', (value) => {
        received.push(value)
        if (received.length === 3) {
          expect(received).toEqual([1, 2, 3])
          done()
        }
      })
      pipeline.publish('foo', 1)
      pipeline.publish('foo', 2)
      pipeline.seal()
      pipeline.publish('foo', 3)
    })

    it('should throw if enrich() is called after seal()', () => {
      const pipeline = new Pipeline<{ foo: string }>()
      pipeline.seal()
      const e: AnyEnricher = { name: 'test', transform: (data: string) => data }
      expect(() => pipeline.enrich('foo', e)).toThrowError(/sealed/)
    })

    it('should throw if seal() is called twice', () => {
      const pipeline = new Pipeline<{ foo: string }>()
      pipeline.seal()
      expect(() => pipeline.seal()).toThrowError(/already sealed/)
    })
  })

  describe('publish / subscribe (no enrichers)', () => {
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
        if (++count === 2) {
          done()
        }
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
  })

  describe('enrichers', () => {
    it('should deliver enriched event to subscriber', (done) => {
      type Events = { obs: { type: string; sessionId?: string } }
      const pipeline = new Pipeline<Events>()
      pipeline.enrich('obs', {
        name: 'session',
        transform: (data) => ({ ...data, sessionId: 'abc-123' }),
      })
      pipeline.seal()
      pipeline.subscribe('obs', (event) => {
        expect(event.sessionId).toBe('abc-123')
        done()
      })
      pipeline.publish('obs', { type: 'error' })
    })

    it('should drop event when enricher returns DISCARD', (done) => {
      type Events = { obs: { type: string }; other: string }
      const pipeline = new Pipeline<Events>()
      pipeline.enrich('obs', {
        name: 'consent',
        transform: () => DISCARD,
      })
      pipeline.seal()
      pipeline.subscribe('obs', () => {
        fail('should not be called for discarded event')
      })
      pipeline.subscribe('other', () => done())
      pipeline.publish('obs', { type: 'action' })
      pipeline.publish('other', 'ok')
    })

    it('should pass enriched data to downstream enrichers', (done) => {
      type BaseObs = { type: string }
      type Events = { obs: BaseObs }
      const pipeline = new Pipeline<Events>()
      const session = createEnricher({
        name: 'session',
        transform: (data: BaseObs) => ({ ...data, sessionId: 'sess-1' }),
      })
      const view = createEnricher({
        name: 'view',
        requires: [session],
        transform: (data) => {
          expect(data.sessionId).toBe('sess-1')
          return { ...data, viewId: 'view-1' }
        },
      })
      pipeline.enrich('obs', session)
      pipeline.enrich('obs', view)
      pipeline.seal()
      pipeline.subscribe('obs', (event) => {
        expect((event as any).sessionId).toBe('sess-1')
        expect((event as any).viewId).toBe('view-1')
        done()
      })
      pipeline.publish('obs', { type: 'error' })
    })

    it('should process events sequentially (not concurrently)', (done) => {
      type Events = { obs: { type: string; order?: number } }
      const pipeline = new Pipeline<Events>()
      const processed: number[] = []
      pipeline.enrich('obs', {
        name: 'slow',
        transform: async (data) => {
          await new Promise((r) => setTimeout(r, 10))
          processed.push(data.order!)
          return data
        },
      })
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

    it('should continue processing after an enricher throws', (done) => {
      type Events = { obs: { type: string }; other: string }
      const pipeline = new Pipeline<Events>()
      pipeline.enrich('obs', {
        name: 'broken',
        transform: () => {
          throw new Error('enricher crashed')
        },
      })
      pipeline.seal()
      pipeline.subscribe('obs', () => {
        fail('crashed event should not be delivered')
      })
      pipeline.subscribe('other', () => done())
      pipeline.publish('obs', { type: 'error' })
      pipeline.publish('other', 'ok')
    })

    it('should pass through unchanged when enricher returns same data', (done) => {
      const pipeline = new Pipeline<{ foo: string }>()
      pipeline.enrich('foo', {
        name: 'noop',
        transform: (data) => data,
      })
      pipeline.seal()
      pipeline.subscribe('foo', (value) => {
        expect(value).toBe('original')
        done()
      })
      pipeline.publish('foo', 'original')
    })
  })
})
