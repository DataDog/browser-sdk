import { vi } from 'vitest'
import { display } from '../tools/display'
import { defineGlobal } from './init'

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

  it('run the queued callbacks on the old value', () => {
    const fn1 = vi.fn()
    const fn2 = vi.fn()
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
    const displaySpy = vi.spyOn(display, 'error')

    defineGlobal(myGlobal, 'foo', {})
    expect(displaySpy).toHaveBeenCalledWith('onReady callback threw an error:', myError)
  })
})
