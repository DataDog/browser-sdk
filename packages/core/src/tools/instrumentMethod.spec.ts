import { instrumentMethod } from './instrumentMethod'

describe('instrumentMethod', () => {
  it('replaces a method', () => {
    const original = () => 1
    const source = { foo: original }

    instrumentMethod(source, 'foo', () => () => 2)

    expect(source.foo).not.toBe(original)
    expect(source.foo()).toBe(2)
  })

  it('sets a method with originally undefined', () => {
    const source: { foo?: () => number } = {}

    instrumentMethod(source, 'foo', () => () => 2)

    expect(source.foo!()).toBe(2)
  })

  it('provides the original method to the replacement factory', () => {
    const original = () => 1
    const source = { foo: original }
    const replacementFactorySpy = jasmine.createSpy().and.callFake((original: () => number) => () => original() + 2)

    instrumentMethod(source, 'foo', replacementFactorySpy)

    expect(replacementFactorySpy).toHaveBeenCalledOnceWith(original)
    expect(source.foo()).toBe(3)
  })

  it('calls the replacement with method arguments', () => {
    const source = { foo: (a: number, b: number) => a + b }
    const replacementSpy = jasmine.createSpy()
    instrumentMethod(source, 'foo', () => replacementSpy)

    source.foo(2, 3)

    expect(replacementSpy).toHaveBeenCalledOnceWith(2, 3)
  })

  it('allows other overrides from third parties', () => {
    const source = { foo: () => 1 }
    const replacementSpy = jasmine.createSpy().and.returnValue(2)
    instrumentMethod(source, 'foo', () => replacementSpy)

    thirdPartyOverride(source)

    expect(source.foo()).toBe(4)
    expect(replacementSpy).toHaveBeenCalled()
  })

  describe('stop()', () => {
    it('restores the original method', () => {
      const original = () => 1
      const source = { foo: original }
      const { stop } = instrumentMethod(source, 'foo', () => () => 2)

      stop()

      expect(source.foo).toBe(original)
    })

    describe('when the method has been overridden by a third party', () => {
      it('does not replace the method', () => {
        const source = { foo: () => 1 }
        const { stop } = instrumentMethod(source, 'foo', () => () => 2)

        thirdPartyOverride(source)
        const overriddenFoo = source.foo

        stop()

        expect(source.foo).toBe(overriddenFoo)
      })

      it('does not call the replacement ', () => {
        const source = { foo: () => 1 }
        const replacementSpy = jasmine.createSpy()
        const { stop } = instrumentMethod(source, 'foo', () => replacementSpy)

        thirdPartyOverride(source)

        stop()

        expect(replacementSpy).not.toHaveBeenCalled()
      })
    })
  })

  function thirdPartyOverride(source: { foo: () => number }) {
    const originalFoo = source.foo
    source.foo = () => originalFoo() + 2
  }
})
