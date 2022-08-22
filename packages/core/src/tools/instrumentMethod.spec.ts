import type { Clock } from '../../test/specHelper'
import { mockClock } from '../../test/specHelper'
import { instrumentMethod, instrumentSetter } from './instrumentMethod'
import { noop } from './utils'

describe('instrumentMethod', () => {
  it('replaces the original method', () => {
    const original = () => 1
    const object = { method: original }

    instrumentMethod(object, 'method', () => () => 2)

    expect(object.method).not.toBe(original)
    expect(object.method()).toBe(2)
  })

  it('sets a method originally undefined', () => {
    const object: { method?: () => number } = {}

    instrumentMethod(object, 'method', () => () => 2)

    expect(object.method!()).toBe(2)
  })

  it('provides the original method to the instrumentation factory', () => {
    const original = () => 1
    const object = { method: original }
    const instrumentationFactorySpy = jasmine.createSpy().and.callFake((original: () => number) => () => original() + 2)

    instrumentMethod(object, 'method', instrumentationFactorySpy)

    expect(instrumentationFactorySpy).toHaveBeenCalledOnceWith(original)
    expect(object.method()).toBe(3)
  })

  it('calls the instrumentation with method arguments', () => {
    const object = { method: (a: number, b: number) => a + b }
    const instrumentationSpy = jasmine.createSpy()
    instrumentMethod(object, 'method', () => instrumentationSpy)

    object.method(2, 3)

    expect(instrumentationSpy).toHaveBeenCalledOnceWith(2, 3)
  })

  it('allows other instrumentations from third parties', () => {
    const object = { method: () => 1 }
    const instrumentationSpy = jasmine.createSpy().and.returnValue(2)
    instrumentMethod(object, 'method', () => instrumentationSpy)

    thirdPartyInstrumentation(object)

    expect(object.method()).toBe(4)
    expect(instrumentationSpy).toHaveBeenCalled()
  })

  describe('stop()', () => {
    it('restores the original behavior', () => {
      const object = { method: () => 1 }
      const { stop } = instrumentMethod(object, 'method', () => () => 2)

      stop()

      expect(object.method()).toBe(1)
    })

    it('does not call the instrumentation anymore', () => {
      const object = { method: () => 1 }
      const instrumentationSpy = jasmine.createSpy()
      const { stop } = instrumentMethod(object, 'method', () => instrumentationSpy)

      stop()

      object.method()
      expect(instrumentationSpy).not.toHaveBeenCalled()
    })

    describe('when the method has been instrumented by a third party', () => {
      it('should not break the third party instrumentation', () => {
        const object = { method: () => 1 }
        const { stop } = instrumentMethod(object, 'method', () => () => 2)

        thirdPartyInstrumentation(object)
        const instrumentedMethod = object.method

        stop()

        expect(object.method).toBe(instrumentedMethod)
      })

      it('does not call the instrumentation', () => {
        const object = { method: () => 1 }
        const instrumentationSpy = jasmine.createSpy()
        const { stop } = instrumentMethod(object, 'method', () => instrumentationSpy)

        thirdPartyInstrumentation(object)

        stop()

        expect(instrumentationSpy).not.toHaveBeenCalled()
      })

      it('should not throw errors if original method was undefined', () => {
        const object: { method?: () => number } = {}
        const instrumentationStub = () => 2
        const { stop } = instrumentMethod(object, 'method', () => instrumentationStub)

        thirdPartyInstrumentation(object)

        stop()

        expect(object.method).not.toThrow()
      })
    })
  })

  function thirdPartyInstrumentation(object: { method?: () => number }) {
    const originalMethod = object.method
    if (typeof originalMethod === 'function') {
      object.method = () => originalMethod() + 2
    }
  }
})

describe('instrumentSetter', () => {
  let clock: Clock
  beforeEach(() => {
    clock = mockClock()
  })
  afterEach(() => {
    clock.cleanup()
  })

  it('replaces the original setter', () => {
    const originalSetter = () => {
      // do nothing particular, only used to test if this setter gets replaced
    }
    const object = {} as { foo: number }
    Object.defineProperty(object, 'foo', { set: originalSetter, configurable: true })

    instrumentSetter(object, 'foo', noop)

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(Object.getOwnPropertyDescriptor(object, 'foo')!.set).not.toBe(originalSetter)
  })

  it('skips instrumentation if there is no original setter', () => {
    const object = { foo: 1 }

    instrumentSetter(object, 'foo', noop)
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(Object.getOwnPropertyDescriptor(object, 'foo')!.set).toBeUndefined()
  })

  it('skips instrumentation if the descriptor is not configurable', () => {
    const originalSetter = () => {
      // do nothing particular, only used to test if this setter gets replaced
    }
    const object = {} as { foo: number }
    Object.defineProperty(object, 'foo', { set: originalSetter, configurable: false })

    instrumentSetter(object, 'foo', noop)
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(Object.getOwnPropertyDescriptor(object, 'foo')!.set).toBe(originalSetter)
  })

  it('calls the original setter', () => {
    const originalSetterSpy = jasmine.createSpy()
    const object = {} as { foo: number }
    Object.defineProperty(object, 'foo', { set: originalSetterSpy, configurable: true })

    instrumentSetter(object, 'foo', noop)

    object.foo = 1
    expect(originalSetterSpy).toHaveBeenCalledOnceWith(1)
  })

  it('calls the instrumentation asynchronously', () => {
    const instrumentationSetterSpy = jasmine.createSpy()
    const object = {} as { foo: number }
    Object.defineProperty(object, 'foo', { set: noop, configurable: true })

    instrumentSetter(object, 'foo', instrumentationSetterSpy)

    object.foo = 1
    expect(instrumentationSetterSpy).not.toHaveBeenCalled()
    clock.tick(0)
    expect(instrumentationSetterSpy).toHaveBeenCalledOnceWith(object, 1)
  })

  it('allows other instrumentations from third parties', () => {
    const object = {} as { foo: number }
    Object.defineProperty(object, 'foo', { set: noop, configurable: true })
    const instrumentationSetterSpy = jasmine.createSpy()
    instrumentSetter(object, 'foo', instrumentationSetterSpy)

    const thirdPartyInstrumentationSpy = thirdPartyInstrumentation(object)

    object.foo = 2
    expect(thirdPartyInstrumentationSpy).toHaveBeenCalledOnceWith(2)
    clock.tick(0)
    expect(instrumentationSetterSpy).toHaveBeenCalledOnceWith(object, 2)
  })

  describe('stop()', () => {
    it('restores the original behavior', () => {
      const object = {} as { foo: number }
      const originalSetter = () => {
        // do nothing particular, only used to test if this setter gets replaced
      }
      Object.defineProperty(object, 'foo', { set: originalSetter, configurable: true })
      const { stop } = instrumentSetter(object, 'foo', noop)

      stop()

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(Object.getOwnPropertyDescriptor(object, 'foo')!.set).toBe(originalSetter)
    })

    it('does not call the instrumentation anymore', () => {
      const object = {} as { foo: number }
      Object.defineProperty(object, 'foo', { set: noop, configurable: true })
      const instrumentationSetterSpy = jasmine.createSpy()
      const { stop } = instrumentSetter(object, 'foo', instrumentationSetterSpy)

      stop()

      object.foo = 2

      expect(instrumentationSetterSpy).not.toHaveBeenCalled()
    })

    describe('when the method has been instrumented by a third party', () => {
      it('should not break the third party instrumentation', () => {
        const object = {} as { foo: number }
        Object.defineProperty(object, 'foo', { set: noop, configurable: true })
        const { stop } = instrumentSetter(object, 'foo', noop)

        const thirdPartyInstrumentationSpy = thirdPartyInstrumentation(object)

        stop()

        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(Object.getOwnPropertyDescriptor(object, 'foo')!.set).toBe(thirdPartyInstrumentationSpy)
      })

      it('does not call the instrumentation', () => {
        const object = {} as { foo: number }
        Object.defineProperty(object, 'foo', { set: noop, configurable: true })
        const instrumentationSetterSpy = jasmine.createSpy()
        const { stop } = instrumentSetter(object, 'foo', noop)

        thirdPartyInstrumentation(object)

        stop()

        object.foo = 2

        expect(instrumentationSetterSpy).not.toHaveBeenCalled()
      })
    })
  })

  function thirdPartyInstrumentation(object: { foo: number }) {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalSetter = Object.getOwnPropertyDescriptor(object, 'foo')!.set
    const thirdPartyInstrumentationSpy = jasmine.createSpy().and.callFake(function (this: any, value) {
      if (originalSetter) {
        originalSetter.call(this, value)
      }
    })
    Object.defineProperty(object, 'foo', { set: thirdPartyInstrumentationSpy })
    return thirdPartyInstrumentationSpy
  }
})
