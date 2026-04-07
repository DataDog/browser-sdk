import { DISCARD, enricher as createEnricher } from '../enricher'
import type { AnyEnricher } from '../enricher'
import { Pipeline } from './pipeline'

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
      interface Events {
        obs: { type: string; sessionId?: string }
      }
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
      interface Events {
        obs: { type: string }
        other: string
      }
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
      interface BaseObs {
        type: string
      }
      interface Events {
        obs: BaseObs
      }
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
      interface Events {
        obs: { type: string; order?: number }
      }
      const pipeline = new Pipeline<Events>()
      const processed: number[] = []
      pipeline.enrich('obs', {
        name: 'slow',
        transform: async (data) => {
          await new Promise((r) => setTimeout(r, 10))
          processed.push(data.order)
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
      interface Events {
        obs: { type: string }
        other: string
      }
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

    it('should report enricher errors via onError callback', (done) => {
      interface Events {
        obs: { type: string }
      }
      const onError = jasmine.createSpy('onError')
      const pipeline = new Pipeline<Events>({ onError })
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
      pipeline.publish('obs', { type: 'error' })
      setTimeout(() => {
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError.calls.first().args[0]).toBeInstanceOf(Error)
        expect(onError.calls.first().args[0].message).toBe('enricher crashed')
        done()
      }, 10)
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

  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- type alias needed for Record<string, unknown> constraint compatibility
  describe('pattern matching', () => {
    type Events = {
      'observation:log': { message: string }
      'observation:rum': { type: string }
      'resource:console': { api: string }
      'signal:expired': void
    }

    it('should deliver to wildcard subscriber (*) for any event type', (done) => {
      const pipeline = new Pipeline<Events>()
      pipeline.seal()
      pipeline.subscribe('*', (event) => {
        expect(event).toEqual({ message: 'test' })
        done()
      })
      pipeline.publish('observation:log', { message: 'test' })
    })

    it('should deliver to prefix pattern subscriber (observation:*)', (done) => {
      const pipeline = new Pipeline<Events>()
      pipeline.seal()
      const received: unknown[] = []
      pipeline.subscribe('observation:*', (event) => {
        received.push(event)
        if (received.length === 2) {
          expect(received).toEqual([{ message: 'test' }, { type: 'view' }])
          done()
        }
      })
      pipeline.publish('observation:log', { message: 'test' })
      pipeline.publish('observation:rum', { type: 'view' })
    })

    it('should not deliver to prefix pattern for non-matching events', (done) => {
      const pipeline = new Pipeline<Events>()
      pipeline.seal()
      pipeline.subscribe('observation:*', () => {
        fail('should not be called for resource events')
      })
      pipeline.subscribe('resource:console', () => done())
      pipeline.publish('resource:console', { api: 'error' })
    })

    it('should enrich all events with wildcard enricher (*)', (done) => {
      const pipeline = new Pipeline<Events>()
      pipeline.enrich('*', {
        name: 'timestamp',
        transform: (data: any) => ({ ...data, enriched: true }),
      })
      pipeline.seal()
      pipeline.subscribe('observation:log', (event) => {
        expect((event as any).enriched).toBe(true)
        done()
      })
      pipeline.publish('observation:log', { message: 'test' })
    })

    it('should enrich matching events with prefix pattern enricher', (done) => {
      const pipeline = new Pipeline<Events>()
      pipeline.enrich('observation:*', {
        name: 'session',
        transform: (data: any) => ({ ...data, sessionId: 'abc' }),
      })
      pipeline.seal()
      let calls = 0
      pipeline.subscribe('observation:log', (event) => {
        expect((event as any).sessionId).toBe('abc')
        calls++
      })
      pipeline.subscribe('resource:console', (event) => {
        expect((event as any).sessionId).toBeUndefined()
        expect(calls).toBe(1)
        done()
      })
      pipeline.publish('observation:log', { message: 'test' })
      pipeline.publish('resource:console', { api: 'error' })
    })

    it('should combine exact and pattern enrichers', (done) => {
      const pipeline = new Pipeline<Events>()
      pipeline.enrich('*', {
        name: 'global',
        transform: (data: any) => ({ ...data, global: true }),
      })
      pipeline.enrich('observation:log', {
        name: 'log-specific',
        transform: (data: any) => ({ ...data, logSpecific: true }),
      })
      pipeline.seal()
      pipeline.subscribe('observation:log', (event) => {
        expect((event as any).global).toBe(true)
        expect((event as any).logSpecific).toBe(true)
        done()
      })
      pipeline.publish('observation:log', { message: 'test' })
    })

    it('should deliver to both exact and pattern subscribers', (done) => {
      const pipeline = new Pipeline<Events>()
      pipeline.seal()
      let count = 0
      pipeline.subscribe('observation:log', () => {
        count++
      })
      pipeline.subscribe('observation:*', () => {
        count++
      })
      pipeline.subscribe('*', () => {
        count++
        expect(count).toBe(3)
        done()
      })
      pipeline.publish('observation:log', { message: 'test' })
    })
  })
})
