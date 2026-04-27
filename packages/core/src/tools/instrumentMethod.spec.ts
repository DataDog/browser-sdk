import { vi, beforeEach, describe, expect, it } from 'vitest'
import { mockClock, mockZoneJs } from '../../test'
import type { Clock, MockZoneJs } from '../../test'
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
    const originalSpy = vi.fn()
    const instrumentationSpy = vi.fn()
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

    const instrumentationSpy = vi.fn()
    instrumentMethod(object, 'onevent', instrumentationSpy)

    expect(object.onevent).toBeDefined()

    object.onevent!()
    expect(instrumentationSpy).toHaveBeenCalled()
  })

  it('do not set an event handler even if the event is not supported (i.e. property does not exist on object)', () => {
    const object: { onevent?: () => void } = {}

    const instrumentationSpy = vi.fn()
    instrumentMethod(object, 'onevent', instrumentationSpy)

    expect('onevent' in object).toBe(false)
  })

  it('calls the instrumentation with method target and parameters', () => {
    const object = { method: (a: number, b: number) => a + b }
    const instrumentationSpy = vi.fn<(call: InstrumentedMethodCall<typeof object, 'method'>) => void>()
    instrumentMethod(object, 'method', instrumentationSpy)

    object.method(2, 3)

    expect(instrumentationSpy).toHaveBeenCalledTimes(1)
    expect(instrumentationSpy).toHaveBeenCalledWith({
      target: object,
      parameters: expect.any(Object),
      onPostCall: expect.any(Function),
      handlingStack: undefined,
    })
    expect(instrumentationSpy.mock.lastCall![0].parameters[0]).toBe(2)
    expect(instrumentationSpy.mock.lastCall![0].parameters[1]).toBe(3)
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
    const onPostCallSpy = vi.fn()
    instrumentMethod(object, 'method', ({ onPostCall }) => onPostCall(onPostCallSpy))

    object.method()

    expect(onPostCallSpy).toHaveBeenCalledTimes(1)
    expect(onPostCallSpy).toHaveBeenCalledWith(1)
  })

  it('allows other instrumentations from third parties', () => {
    const object = { method: () => 1 }
    const instrumentationSpy = vi.fn()
    instrumentMethod(object, 'method', instrumentationSpy)

    thirdPartyInstrumentation(object)

    expect(object.method()).toBe(THIRD_PARTY_RESULT)
    expect(instrumentationSpy).toHaveBeenCalled()
  })

  it('computes the handling stack', () => {
    const object = { method: () => 1 }
    const instrumentationSpy = vi.fn()
    instrumentMethod(object, 'method', instrumentationSpy, { computeHandlingStack: true })

    function foo() {
      object.method()
    }

    foo()

    expect(instrumentationSpy.mock.lastCall![0].handlingStack).toEqual(
      expect.stringMatching(/^HandlingStack: instrumented method\n {2}at foo @/)
    )
  })

  describe('stop()', () => {
    it('does not call the instrumentation anymore', () => {
      const object = { method: () => 1 }
      const instrumentationSpy = vi.fn()
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
        const instrumentationSpy = vi.fn()
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

  function thirdPartyInstrumentation(object: { method?: () => number; onevent?: () => void }) {
    const originalMethod = object.method
    if (typeof originalMethod === 'function') {
      object.method = () => {
        originalMethod()
        return THIRD_PARTY_RESULT
      }
    }

    const originalOnEvent = object.onevent
    object.onevent = () => {
      if (originalOnEvent) {
        originalOnEvent()
      }
    }
  }
})

describe('instrumentSetter', () => {
  let clock: Clock
  let zoneJs: MockZoneJs

  beforeEach(() => {
    clock = mockClock()
    zoneJs = mockZoneJs()
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
    const originalSetterSpy = vi.fn()
    const object = {} as { foo: number }
    Object.defineProperty(object, 'foo', { set: originalSetterSpy, configurable: true })

    instrumentSetter(object, 'foo', noop)

    object.foo = 1
    expect(originalSetterSpy).toHaveBeenCalledTimes(1)
    expect(originalSetterSpy).toHaveBeenCalledWith(1)
  })

  it('calls the instrumentation asynchronously', () => {
    const instrumentationSetterSpy = vi.fn()
    const object = {} as { foo: number }
    Object.defineProperty(object, 'foo', { set: noop, configurable: true })

    instrumentSetter(object, 'foo', instrumentationSetterSpy)

    object.foo = 1
    expect(instrumentationSetterSpy).not.toHaveBeenCalled()
    clock.tick(0)
    expect(instrumentationSetterSpy).toHaveBeenCalledTimes(1)
    expect(instrumentationSetterSpy).toHaveBeenCalledWith(object, 1)
  })

  it('does not use the Zone.js setTimeout function', () => {
    const zoneJsSetTimeoutSpy = vi.fn()
    zoneJs.replaceProperty(window, 'setTimeout', zoneJsSetTimeoutSpy as any)

    const object = {} as { foo: number }
    Object.defineProperty(object, 'foo', { set: noop, configurable: true })

    instrumentSetter(object, 'foo', noop)
    object.foo = 2

    clock.tick(0)

    expect(zoneJsSetTimeoutSpy).not.toHaveBeenCalled()
  })

  it('allows other instrumentations from third parties', () => {
    const object = {} as { foo: number }
    Object.defineProperty(object, 'foo', { set: noop, configurable: true })
    const instrumentationSetterSpy = vi.fn()
    instrumentSetter(object, 'foo', instrumentationSetterSpy)

    const thirdPartyInstrumentationSpy = thirdPartyInstrumentation(object)

    object.foo = 2
    expect(thirdPartyInstrumentationSpy).toHaveBeenCalledTimes(1)
    expect(thirdPartyInstrumentationSpy).toHaveBeenCalledWith(2)
    clock.tick(0)
    expect(instrumentationSetterSpy).toHaveBeenCalledTimes(1)
    expect(instrumentationSetterSpy).toHaveBeenCalledWith(object, 2)
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
      const instrumentationSetterSpy = vi.fn()
      const { stop } = instrumentSetter(object, 'foo', instrumentationSetterSpy)

      stop()

      object.foo = 2
      clock.tick(0)

      expect(instrumentationSetterSpy).not.toHaveBeenCalled()
    })

    it('does not call instrumentation pending in the event loop via setTimeout', () => {
      const object = {} as { foo: number }
      Object.defineProperty(object, 'foo', { set: noop, configurable: true })
      const instrumentationSetterSpy = vi.fn()
      const { stop } = instrumentSetter(object, 'foo', instrumentationSetterSpy)

      object.foo = 2
      stop()
      clock.tick(0)

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
        const instrumentationSetterSpy = vi.fn()
        const { stop } = instrumentSetter(object, 'foo', instrumentationSetterSpy)

        thirdPartyInstrumentation(object)

        stop()

        object.foo = 2
        clock.tick(0)

        expect(instrumentationSetterSpy).not.toHaveBeenCalled()
      })
    })
  })

  function thirdPartyInstrumentation(object: { foo: number }) {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalSetter = Object.getOwnPropertyDescriptor(object, 'foo')!.set
    const thirdPartyInstrumentationSpy = vi.fn().mockImplementation(function (this: any, value) {
      if (originalSetter) {
        originalSetter.call(this, value)
      }
    })
    Object.defineProperty(object, 'foo', { set: thirdPartyInstrumentationSpy })
    return thirdPartyInstrumentationSpy
  }
})
