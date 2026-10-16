import { display } from '../tools/display'
import { defineGlobal } from './init'

describe('defineGlobal', () => {
  it('delegates to @datadog/js-core/runtime and adds new property to the global object', () => {
    const myGlobal = {} as any
    const value = 'my value'
    defineGlobal(myGlobal, 'foo', value)
    expect(myGlobal.foo).toBe(value)
  })

  it('delegates to @datadog/js-core/runtime using browser-core own display', () => {
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
    const displaySpy = spyOn(display, 'error')

    defineGlobal(myGlobal, 'foo', {})
    expect(displaySpy).toHaveBeenCalledWith('onReady callback threw an error:', myError)
  })

  it('warns through browser-core own display when the SDK is loaded more than once', () => {
    const myGlobal: any = {
      foo: {
        version: '1.2.3',
      },
    }
    const displaySpy = spyOn(display, 'warn')

    defineGlobal(myGlobal, 'foo', {})
    expect(displaySpy).toHaveBeenCalledWith(
      'SDK is loaded more than once. This is unsupported and might have unexpected behavior.'
    )
  })
})
