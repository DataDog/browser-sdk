import { display } from '../../tools/display'
import type { PropertiesConfig } from './contextManager'
import { createContextManager } from './contextManager'

function createContextManagerWithDefaults(propertiesConfig?: PropertiesConfig) {
  return createContextManager('test', { propertiesConfig })
}

describe('createContextManager', () => {
  it('starts with an empty context', () => {
    const manager = createContextManagerWithDefaults()
    expect(manager.getContext()).toEqual({})
  })

  it('updates the context', () => {
    const manager = createContextManagerWithDefaults()
    manager.setContext({ bar: 'foo' })

    expect(manager.getContext()).toEqual({ bar: 'foo' })
  })

  it('completely replaces the context', () => {
    const manager = createContextManagerWithDefaults()
    manager.setContext({ a: 'foo' })
    expect(manager.getContext()).toEqual({ a: 'foo' })
    manager.setContext({ b: 'foo' })
    expect(manager.getContext()).toEqual({ b: 'foo' })
  })

  it('sets a context value', () => {
    const manager = createContextManagerWithDefaults()
    manager.setContextProperty('foo', 'bar')
    expect(manager.getContext()).toEqual({ foo: 'bar' })
  })

  it('removes a context value', () => {
    const manager = createContextManagerWithDefaults()
    manager.setContext({ a: 'foo', b: 'bar' })
    manager.removeContextProperty('a')
    expect(manager.getContext()).toEqual({ b: 'bar' })
    manager.removeContextProperty('b')
    expect(manager.getContext()).toEqual({})
  })

  it('should get a clone of the context from getContext', () => {
    const manager = createContextManagerWithDefaults()
    expect(manager.getContext()).toEqual(manager.getContext())
    expect(manager.getContext()).not.toBe(manager.getContext())
  })

  it('should set a clone of context via setContext', () => {
    const nestedObject = { foo: 'bar' }
    const context = { nested: nestedObject }
    const manager = createContextManagerWithDefaults()
    manager.setContext(context)
    expect(manager.getContext().nested).toEqual(nestedObject)
    expect(manager.getContext().nested).not.toBe(nestedObject)
  })

  it('should set a clone of the property via setContextProperty', () => {
    const nestedObject = { foo: 'bar' }
    const manager = createContextManagerWithDefaults()
    manager.setContextProperty('nested', nestedObject)
    expect(manager.getContext().nested).toEqual(nestedObject)
    expect(manager.getContext().nested).not.toBe(nestedObject)
  })

  it('should clear context object via clearContext', () => {
    const context = { foo: 'bar' }
    const manager = createContextManagerWithDefaults()
    manager.setContext(context)
    expect(manager.getContext()).toEqual(context)
    manager.clearContext()
    expect(manager.getContext()).toEqual({})
  })

  it('should prevent setting non object values', () => {
    spyOn(display, 'error')
    const manager = createContextManagerWithDefaults()
    manager.setContext(null as any)
    expect(manager.getContext()).toEqual({})
    manager.setContext(undefined as any)
    expect(manager.getContext()).toEqual({})
    manager.setContext(2 as any)
    expect(manager.getContext()).toEqual({})
  })

  describe('type enforcement', () => {
    const NULLISH_VALUES = [undefined, null, '']

    it('should enforce specified type on properties', () => {
      const manager = createContextManagerWithDefaults({
        id: { type: 'string' },
        name: { type: 'string' },
        email: { type: 'string' },
      })

      manager.setContext({ id: 42, name: true, email: {} })

      expect(manager.getContext()).toEqual({ id: '42', name: 'true', email: '[object Object]' })
    })

    it('should not enforce specified type on null or undefined properties', () => {
      const manager = createContextManagerWithDefaults({
        id: { type: 'string' },
        name: { type: 'string' },
      })

      manager.setContext({ id: undefined, name: null })
      expect(manager.getContext()).toEqual({ id: undefined, name: null })
    })

    NULLISH_VALUES.forEach((value) => {
      it(`should warn when required property is  ${value}`, () => {
        const displaySpy = spyOn(display, 'warn')

        const manager = createContextManagerWithDefaults({
          id: { required: true },
        })

        manager.setContext({ id: value })

        expect(displaySpy).toHaveBeenCalledOnceWith(
          'The property id of test is required; context will not be sent to the intake.'
        )
      })
    })
  })

  describe('changeObservable', () => {
    it('should notify on context changes', () => {
      const changeSpy = jasmine.createSpy('change')
      const manager = createContextManagerWithDefaults()
      manager.changeObservable.subscribe(changeSpy)

      manager.getContext()
      expect(changeSpy).not.toHaveBeenCalled()

      manager.setContext({ foo: 'bar' })
      expect(changeSpy).toHaveBeenCalledTimes(1)

      manager.setContextProperty('qux', 'qix')
      expect(changeSpy).toHaveBeenCalledTimes(2)

      manager.removeContextProperty('qux')
      expect(changeSpy).toHaveBeenCalledTimes(3)

      manager.clearContext()
      expect(changeSpy).toHaveBeenCalledTimes(4)
    })
  })
})
