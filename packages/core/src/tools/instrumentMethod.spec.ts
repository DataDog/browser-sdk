import { mockZoneJs } from '../../test'
import type { InstrumentedMethodCall } from './instrumentMethod'
import { instrumentMethod, instrumentSetter } from './instrumentMethod'
import { noop } from './utils/functionUtils'

describe('instrumentMethod', () => {
  const THIRD_PARTY_RESULT = 42

  it('replaces the original method', () => {
    const original = () => 1
    const object = { method: original }

    instrumentMethod(object, 'method', noop)

    expect(object.method).not.toBe(original)
  })

  it('calls the instrumentation before the original method', () => {
    const originalSpy = jasmine.createSpy()
    const instrumentationSpy = jasmine.createSpy()
    const object = { method: originalSpy }

    instrumentMethod(object, 'method', instrumentationSpy)

    object.method()

    expect(instrumentationSpy).toHaveBeenCalledBefore(originalSpy)
  })

  it('does not set a method originally undefined', () => {
    const object: { method?: () => number } = {}

    instrumentMethod(object, 'method', noop)

    expect(object.method).toBeUndefined()
  })

  it('sets an event handler even if it was originally undefined', () => {
    const object: { onevent?: () => void } = { onevent: undefined }

    const instrumentationSpy = jasmine.createSpy()
    instrumentMethod(object, 'onevent', instrumentationSpy)

    expect(object.onevent).toBeDefined()

    object.onevent!()
    expect(instrumentationSpy).toHaveBeenCalled()
  })

  it('do not set an event handler even if the event is not supported (i.e. property does not exist on object)', () => {
    const object: { onevent?: () => void } = {}

    const instrumentationSpy = jasmine.createSpy()
    instrumentMethod(object, 'onevent', instrumentationSpy)

    expect('onevent' in object).toBeFalse()
  })

  it('calls the instrumentation with method target and parameters', () => {
    const object = { method: (a: number, b: number) => a + b }
    const instrumentationSpy = jasmine.createSpy<(call: InstrumentedMethodCall<typeof object, 'method'>) => void>()
    instrumentMethod(object, 'method', instrumentationSpy)

    object.method(2, 3)

    expect(instrumentationSpy).toHaveBeenCalledOnceWith({
      target: object,
      parameters: jasmine.any(Object),
      onPostCall: jasmine.any(Function),
      handlingStack: undefined,
    })
    expect(instrumentationSpy.calls.mostRecent().args[0].parameters[0]).toBe(2)
    expect(instrumentationSpy.calls.mostRecent().args[0].parameters[1]).toBe(3)
  })

  it('allows replacing a parameter', () => {
    const object = { method: (a: number) => a }
    instrumentMethod(object, 'method', ({ parameters }) => {
      parameters[0] = 2
    })

    expect(object.method(1)).toBe(2)
  })

  it('allows adding a parameter', () => {
    const object = { method: (a?: number) => a }
    instrumentMethod(object, 'method', ({ parameters }) => {
      parameters[0] = 2
    })

    expect(object.method()).toBe(2)
  })

  it('calls the "onPostCall" callback with the original method result', () => {
    const object = { method: () => 1 }
    const onPostCallSpy = jasmine.createSpy()
    instrumentMethod(object, 'method', ({ onPostCall }) => onPostCall(onPostCallSpy))

    object.method()

    expect(onPostCallSpy).toHaveBeenCalledOnceWith(1)
  })

  it('allows other instrumentations from third parties', () => {
    const object = { method: () => 1 }
    const instrumentationSpy = jasmine.createSpy()
    instrumentMethod(object, 'method', instrumentationSpy)

    thirdPartyInstrumentation(object)

    expect(object.method()).toBe(THIRD_PARTY_RESULT)
    expect(instrumentationSpy).toHaveBeenCalled()
  })

  it('computes the handling stack', () => {
    const object = { method: () => 1 }
    const instrumentationSpy = jasmine.createSpy()
    instrumentMethod(object, 'method', instrumentationSpy, { computeHandlingStack: true })

    function foo() {
      object.method()
    }

    foo()

    expect(instrumentationSpy.calls.mostRecent().args[0].handlingStack).toEqual(
      jasmine.stringMatching(/^Error: \n {2}at foo @/)
    )
  })

  it('wraps each method only once even if we instrument it multiple times', () => {
    const object = { method: () => 1 }
    expect(object.method()).toBe(1)

    for (let i = 0; i < 10_000; i++) {
      const { stop: stopOurs } = instrumentMethod(object, 'method', noop)
      const { stop: stopTheirs } = instrumentMethod(object, 'method', noop)
      stopOurs()
      stopTheirs()
    }

    // If we rewrap the method every time, this will throw `RangeError: Maximum
    // call stack size exceeded.`
    expect(object.method()).toBe(1)
  })

  it('wraps each method only once even if a third party instruments it multiple times', () => {
    const object = { method: () => 1 }
    expect(object.method()).toBe(1)

    for (let i = 0; i < 10_000; i++) {
      const { stop: stopOurs } = instrumentMethod(object, 'method', noop)
      const { stop: stopTheirs } = thirdPartyInstrumentation(object)
      stopOurs()
      stopTheirs()
    }

    // If we rewrap the method every time, this will throw `RangeError: Maximum
    // call stack size exceeded.`
    expect(object.method()).toBe(1)
  })

  describe('stop()', () => {
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
        const { stop } = instrumentMethod(object, 'method', noop)

        thirdPartyInstrumentation(object)
        const instrumentedMethod = object.method

        stop()

        expect(object.method).toBe(instrumentedMethod)
      })

      it('does not call the instrumentation', () => {
        const object = { method: () => 1 }
        const instrumentationSpy = jasmine.createSpy()
        const { stop } = instrumentMethod(object, 'method', instrumentationSpy)

        thirdPartyInstrumentation(object)

        stop()

        expect(instrumentationSpy).not.toHaveBeenCalled()
      })

      it('should not throw errors if original method was undefined', () => {
        const object: { onevent?: () => number } = {}
        const instrumentationStub = () => 2
        const { stop } = instrumentMethod(object, 'onevent', instrumentationStub)

        thirdPartyInstrumentation(object)

        stop()

        expect(object.onevent).not.toThrow()
      })
    })
  })

  function thirdPartyInstrumentation(object: { method?: () => number; onevent?: () => void }): { stop: () => void } {
    const originalMethod = object.method
    let methodInstrumentation: (() => number) | undefined
    if (typeof originalMethod === 'function') {
      methodInstrumentation = () => {
        originalMethod()
        return THIRD_PARTY_RESULT
      }
      object.method = methodInstrumentation
    }

    const originalOnEvent = object.onevent
    const onEventInstrumentation = (): void => {
      if (originalOnEvent) {
        originalOnEvent()
      }
    }
    object.onevent = onEventInstrumentation

    return {
      stop: () => {
        if (methodInstrumentation && object.method === methodInstrumentation) {
          object.method = originalMethod
        }
        if (object.onevent === onEventInstrumentation) {
          object.onevent = originalOnEvent
        }
      },
    }
  }
})

describe('instrumentSetter', () => {
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

  it('calls the instrumentation asynchronously', async () => {
    const instrumentationSetterSpy = jasmine.createSpy()
    const object = {} as { foo: number }
    Object.defineProperty(object, 'foo', { set: noop, configurable: true })

    instrumentSetter(object, 'foo', instrumentationSetterSpy)

    object.foo = 1
    expect(instrumentationSetterSpy).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(instrumentationSetterSpy).toHaveBeenCalledOnceWith(object, 1)
  })

  // Note that this is trivially true, since instrumentSetter now uses promises and not
  // setTimeout, but it's still worth verifying that we don't accidentally regress.
  it('does not use the Zone.js setTimeout function', async () => {
    const zoneJsSetTimeoutSpy = jasmine.createSpy()
    const zoneJs = mockZoneJs()
    zoneJs.replaceProperty(window, 'setTimeout', zoneJsSetTimeoutSpy)

    const object = {} as { foo: number }
    Object.defineProperty(object, 'foo', { set: noop, configurable: true })

    instrumentSetter(object, 'foo', noop)
    object.foo = 2

    await Promise.resolve()

    expect(zoneJsSetTimeoutSpy).not.toHaveBeenCalled()
  })

  it('allows other instrumentations from third parties', async () => {
    const object = {} as { foo: number }
    Object.defineProperty(object, 'foo', { set: noop, configurable: true })
    const instrumentationSetterSpy = jasmine.createSpy()
    instrumentSetter(object, 'foo', instrumentationSetterSpy)

    const thirdPartyInstrumentationSpy = thirdPartyInstrumentation(object)

    object.foo = 2
    expect(thirdPartyInstrumentationSpy).toHaveBeenCalledOnceWith(2)
    await Promise.resolve()
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

    it('does not call the instrumentation anymore', async () => {
      const object = {} as { foo: number }
      Object.defineProperty(object, 'foo', { set: noop, configurable: true })
      const instrumentationSetterSpy = jasmine.createSpy()
      const { stop } = instrumentSetter(object, 'foo', instrumentationSetterSpy)

      stop()

      object.foo = 2
      await Promise.resolve()

      expect(instrumentationSetterSpy).not.toHaveBeenCalled()
    })

    it('does not call instrumentation pending in the event loop', async () => {
      const object = {} as { foo: number }
      Object.defineProperty(object, 'foo', { set: noop, configurable: true })
      const instrumentationSetterSpy = jasmine.createSpy()
      const { stop } = instrumentSetter(object, 'foo', instrumentationSetterSpy)

      object.foo = 2
      stop()
      await Promise.resolve()

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

      it('does not call the instrumentation', async () => {
        const object = {} as { foo: number }
        Object.defineProperty(object, 'foo', { set: noop, configurable: true })
        const instrumentationSetterSpy = jasmine.createSpy()
        const { stop } = instrumentSetter(object, 'foo', instrumentationSetterSpy)

        thirdPartyInstrumentation(object)

        stop()

        object.foo = 2
        await Promise.resolve()

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
