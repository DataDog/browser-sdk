import { vi } from 'vitest'
import { AbstractLifeCycle } from './abstractLifeCycle'

describe('AbstractLifeCycle', () => {
  const LifeCycle = AbstractLifeCycle<{
    foo: 'bar'
    no_data: void
  }>

  it('does nothing when notifying without subscribers', () => {
    const lifeCycle = new LifeCycle()
    expect(() => lifeCycle.notify('foo', 'bar')).not.toThrow()
  })

  it('notifies subscribers', () => {
    const lifeCycle = new LifeCycle()
    const subscriber1Spy = vi.fn()
    const subscriber2Spy = vi.fn()
    lifeCycle.subscribe('foo', subscriber1Spy)
    lifeCycle.subscribe('foo', subscriber2Spy)

    lifeCycle.notify('foo', 'bar')

    expect(subscriber1Spy).toHaveBeenCalledTimes(1)
    expect(subscriber1Spy).toHaveBeenCalledWith('bar')
    expect(subscriber2Spy).toHaveBeenCalledTimes(1)
    expect(subscriber2Spy).toHaveBeenCalledWith('bar')
  })

  it('notifies subscribers for events without data', () => {
    const lifeCycle = new LifeCycle()
    const subscriberSpy = vi.fn()
    lifeCycle.subscribe('no_data', subscriberSpy)

    lifeCycle.notify('no_data')

    expect(subscriberSpy).toHaveBeenCalledTimes(1)
    expect(subscriberSpy).toHaveBeenCalledWith(undefined)
  })

  it('does not notify unsubscribed subscribers', () => {
    const lifeCycle = new LifeCycle()
    const subscriberSpy = vi.fn()
    lifeCycle.subscribe('foo', subscriberSpy).unsubscribe()

    lifeCycle.notify('foo', 'bar')

    expect(subscriberSpy).not.toHaveBeenCalled()
  })
})
