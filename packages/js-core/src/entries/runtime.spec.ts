import { originalConsoleMethods } from '../util/display'
import { defineGlobal } from './runtime'

describe('defineGlobal', () => {
  it('adds new property to the global object', () => {
    const myGlobal = {} as any
    const value = 'my value'
    defineGlobal(myGlobal, 'foo', value)
    expect(myGlobal.foo).toBe(value)
  })

  it('overrides property if exists on the global object', () => {
    const myGlobal = { foo: 'old value' }
    const value = 'my value'
    defineGlobal(myGlobal, 'foo', value)
    expect(myGlobal.foo).toBe(value)
  })

  it('runs the queued callbacks on the old value', () => {
    const fn1 = jasmine.createSpy()
    const fn2 = jasmine.createSpy()
    const myGlobal: any = {
      foo: {
        q: [fn1, fn2],
      },
    }
    const value = 'my value'
    defineGlobal(myGlobal, 'foo', value)
    expect(myGlobal.foo).toBe(value)
    expect(fn1).toHaveBeenCalled()
    expect(fn2).toHaveBeenCalled()
  })

  it('catches the errors thrown by the queued callbacks', () => {
    const myError = 'Ooops!'
    const onReady = () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw myError
    }
    const myGlobal: any = {
      foo: {
        q: [onReady],
      },
    }
    const displaySpy = spyOn(originalConsoleMethods, 'error')

    defineGlobal(myGlobal, 'foo', {})
    expect(displaySpy).toHaveBeenCalledWith('Datadog SDK:', 'onReady callback threw an error:', myError)
  })

  it('warns when a previous SDK instance is already installed', () => {
    const myGlobal: any = {
      foo: {
        version: '1.2.3',
      },
    }
    const displaySpy = spyOn(originalConsoleMethods, 'warn')

    defineGlobal(myGlobal, 'foo', {})
    expect(displaySpy).toHaveBeenCalledWith(
      'Datadog SDK:',
      'SDK is loaded more than once. This is unsupported and might have unexpected behavior.'
    )
  })

  it('does not warn when the existing global has an onReady queue', () => {
    const myGlobal: any = {
      foo: {
        q: [],
        version: '1.2.3',
      },
    }
    const displaySpy = spyOn(originalConsoleMethods, 'warn')

    defineGlobal(myGlobal, 'foo', {})
    expect(displaySpy).not.toHaveBeenCalled()
  })
})
