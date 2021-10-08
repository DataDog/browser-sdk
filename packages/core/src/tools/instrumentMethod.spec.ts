import { instrumentMethod } from './instrumentMethod'

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
    })
  })

  function thirdPartyInstrumentation(object: { method: () => number }) {
    const originalMethod = object.method
    object.method = () => originalMethod() + 2
  }
})
