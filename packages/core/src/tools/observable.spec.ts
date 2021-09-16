import { Observable } from '@datadog/browser-core'

describe('observable', () => {
  let observable: Observable<void>
  let subscriber: jasmine.Spy<jasmine.Func>

  beforeEach(() => {
    observable = new Observable()
    subscriber = jasmine.createSpy('sub')
  })

  it('should allow to subscribe and be notified', () => {
    observable.subscribe(subscriber)
    expect(subscriber).not.toHaveBeenCalled()

    observable.notify()
    expect(subscriber).toHaveBeenCalledTimes(1)

    observable.notify()
    expect(subscriber).toHaveBeenCalledTimes(2)
  })

  it('should notify multiple clients', () => {
    const otherSubscriber = jasmine.createSpy('sub2')
    observable.subscribe(subscriber)
    observable.subscribe(otherSubscriber)

    observable.notify()

    expect(subscriber).toHaveBeenCalled()
    expect(otherSubscriber).toHaveBeenCalled()
  })

  it('should allow to unsubscribe', () => {
    const subscription = observable.subscribe(subscriber)

    subscription.unsubscribe()
    observable.notify()

    expect(subscriber).not.toHaveBeenCalled()
  })

  it('should execute onFirstSubscribe callback', () => {
    const onFirstSubscribe = jasmine.createSpy('callback')
    const otherSubscriber = jasmine.createSpy('sub2')
    observable = new Observable(onFirstSubscribe)
    expect(onFirstSubscribe).not.toHaveBeenCalled()

    observable.subscribe(subscriber)
    expect(onFirstSubscribe).toHaveBeenCalledTimes(1)

    observable.subscribe(otherSubscriber)
    expect(onFirstSubscribe).toHaveBeenCalledTimes(1)
  })

  it('should execute onLastUnsubscribe callback', () => {
    const onLastUnsubscribe = jasmine.createSpy('callback')
    const otherSubscriber = jasmine.createSpy('sub2')
    observable = new Observable(() => onLastUnsubscribe)
    const subscription = observable.subscribe(subscriber)
    const otherSubscription = observable.subscribe(otherSubscriber)
    expect(onLastUnsubscribe).not.toHaveBeenCalled()

    subscription.unsubscribe()
    expect(onLastUnsubscribe).not.toHaveBeenCalled()

    otherSubscription.unsubscribe()
    expect(onLastUnsubscribe).toHaveBeenCalled()
  })
})
