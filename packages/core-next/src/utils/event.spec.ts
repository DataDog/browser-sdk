import { EventEmitter } from './event'

interface TestEvents {
  data: string
  count: number
}

describe('EventEmitter', () => {
  it('should call listener when event is emitted', () => {
    const emitter = new EventEmitter<TestEvents>()
    const listener = jasmine.createSpy('listener')

    emitter.on('data', listener)
    emitter.emit('data', 'hello')

    expect(listener).toHaveBeenCalledWith('hello')
  })

  it('should call multiple listeners for the same event', () => {
    const emitter = new EventEmitter<TestEvents>()
    const a = jasmine.createSpy('a')
    const b = jasmine.createSpy('b')

    emitter.on('data', a)
    emitter.on('data', b)
    emitter.emit('data', 'hello')

    expect(a).toHaveBeenCalledWith('hello')
    expect(b).toHaveBeenCalledWith('hello')
  })

  it('should not call listener after off', () => {
    const emitter = new EventEmitter<TestEvents>()
    const listener = jasmine.createSpy('listener')

    emitter.on('data', listener)
    emitter.off('data', listener)
    emitter.emit('data', 'hello')

    expect(listener).not.toHaveBeenCalled()
  })

  it('should not affect other listeners when one is removed', () => {
    const emitter = new EventEmitter<TestEvents>()
    const a = jasmine.createSpy('a')
    const b = jasmine.createSpy('b')

    emitter.on('data', a)
    emitter.on('data', b)
    emitter.off('data', a)
    emitter.emit('data', 'hello')

    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledWith('hello')
  })

  it('should handle different event types independently', () => {
    const emitter = new EventEmitter<TestEvents>()
    const dataListener = jasmine.createSpy('dataListener')
    const countListener = jasmine.createSpy('countListener')

    emitter.on('data', dataListener)
    emitter.on('count', countListener)
    emitter.emit('data', 'hello')

    expect(dataListener).toHaveBeenCalledWith('hello')
    expect(countListener).not.toHaveBeenCalled()
  })
})
