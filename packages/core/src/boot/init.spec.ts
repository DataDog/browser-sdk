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
      throw myError
    }
    const myGlobal: any = {
      foo: {
        q: [fn],
      },
    }
    const consoleErrorSpy = spyOn(console, 'error')

    defineGlobal(myGlobal, 'foo', {})
    expect(consoleErrorSpy).toHaveBeenCalledWith('onReady callback threw an error:', myError)
  })
})
