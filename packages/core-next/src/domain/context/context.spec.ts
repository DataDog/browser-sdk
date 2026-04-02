import { ContextManager } from './context'

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- type alias needed for Record<string, unknown> constraint compatibility
type TestContext = {
  foo?: string
  count?: number
  keep?: boolean
}

describe('ContextManager', () => {
  describe('get/set', () => {
    it('should return empty object initially', () => {
      const ctx = new ContextManager()

      expect(ctx.get()).toEqual({})
    })

    it('should return the full context after set', () => {
      const ctx = new ContextManager<TestContext>()

      ctx.set({ foo: 'bar', count: 42 })

      expect(ctx.get()).toEqual({ foo: 'bar', count: 42 })
    })

    it('should replace the entire context on set', () => {
      const ctx = new ContextManager<TestContext>()

      ctx.set({ foo: 'a', count: 1 })
      ctx.set({ count: 3 })

      expect(ctx.get()).toEqual({ count: 3 })
    })
  })

  describe('setProperty', () => {
    it('should add a property to the context', () => {
      const ctx = new ContextManager<TestContext>()

      ctx.setProperty('foo', 'bar')

      expect(ctx.get()).toEqual({ foo: 'bar' })
    })

    it('should overwrite an existing property', () => {
      const ctx = new ContextManager<TestContext>()

      ctx.setProperty('foo', 'bar')
      ctx.setProperty('foo', 'baz')

      expect(ctx.get()).toEqual({ foo: 'baz' })
    })
  })

  describe('removeProperty', () => {
    it('should remove a property from the context', () => {
      const ctx = new ContextManager<TestContext>()
      ctx.set({ foo: 'bar', keep: true })

      ctx.removeProperty('foo')

      expect(ctx.get()).toEqual({ keep: true })
    })

    it('should do nothing when removing a non-existent property', () => {
      const ctx = new ContextManager<TestContext>()
      ctx.set({ foo: 'bar' })

      ctx.removeProperty('keep')

      expect(ctx.get()).toEqual({ foo: 'bar' })
    })
  })

  describe('clear', () => {
    it('should reset context to empty object', () => {
      const ctx = new ContextManager<TestContext>()
      ctx.set({ foo: 'bar', count: 42 })

      ctx.clear()

      expect(ctx.get()).toEqual({})
    })
  })

  describe('change event', () => {
    it('should emit the context on set', () => {
      const ctx = new ContextManager<TestContext>()
      const changeSpy = jasmine.createSpy('change')
      ctx.on('change', changeSpy)

      ctx.set({ foo: 'bar' })

      expect(changeSpy).toHaveBeenCalledOnceWith({ foo: 'bar' })
    })

    it('should emit the context on setProperty', () => {
      const ctx = new ContextManager<TestContext>()
      const changeSpy = jasmine.createSpy('change')
      ctx.on('change', changeSpy)

      ctx.setProperty('foo', 'bar')

      expect(changeSpy).toHaveBeenCalledOnceWith({ foo: 'bar' })
    })

    it('should emit the context on removeProperty', () => {
      const ctx = new ContextManager<TestContext>()
      ctx.set({ foo: 'bar', keep: true })
      const changeSpy = jasmine.createSpy('change')
      ctx.on('change', changeSpy)

      ctx.removeProperty('foo')

      expect(changeSpy).toHaveBeenCalledOnceWith({ keep: true })
    })

    it('should emit the context on clear', () => {
      const ctx = new ContextManager<TestContext>()
      ctx.set({ foo: 'bar' })
      const changeSpy = jasmine.createSpy('change')
      ctx.on('change', changeSpy)

      ctx.clear()

      expect(changeSpy).toHaveBeenCalledOnceWith({})
    })
  })
})
