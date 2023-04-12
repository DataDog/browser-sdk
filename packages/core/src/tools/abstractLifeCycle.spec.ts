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
    const subscriber1Spy = jasmine.createSpy()
    const subscriber2Spy = jasmine.createSpy()
    lifeCycle.subscribe('foo', subscriber1Spy)
    lifeCycle.subscribe('foo', subscriber2Spy)

    lifeCycle.notify('foo', 'bar')

    expect(subscriber1Spy).toHaveBeenCalledOnceWith('bar')
    expect(subscriber2Spy).toHaveBeenCalledOnceWith('bar')
  })

  it('notifies subscribers for events without data', () => {
    const lifeCycle = new LifeCycle()
    const subscriberSpy = jasmine.createSpy()
    lifeCycle.subscribe('no_data', subscriberSpy)

    lifeCycle.notify('no_data')

    expect(subscriberSpy).toHaveBeenCalledOnceWith(undefined)
  })

  it('does not notify unsubscribed subscribers', () => {
    const lifeCycle = new LifeCycle()
    const subscriberSpy = jasmine.createSpy()
    lifeCycle.subscribe('foo', subscriberSpy).unsubscribe()

    lifeCycle.notify('foo', 'bar')

    expect(subscriberSpy).not.toHaveBeenCalled()
  })
})
