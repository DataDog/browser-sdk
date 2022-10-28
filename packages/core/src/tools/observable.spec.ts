import { mergeObservables, Observable } from './observable'

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

  it('should return boolean if has subscribers', () => {
    observable = new Observable()
    expect(observable.hasSubscribers()).toBe(false)
    const { unsubscribe } = observable.subscribe(() => ({}))
    expect(observable.hasSubscribers()).toBe(true)
    unsubscribe()
    expect(observable.hasSubscribers()).toBe(false)
  })
})

describe('mergeObservables', () => {
  let observableOne: Observable<void>
  let observableTwo: Observable<void>
  let mergedObservable: Observable<void>
  let subscriber: jasmine.Spy<jasmine.Func>

  beforeEach(() => {
    observableOne = new Observable<void>()
    observableTwo = new Observable<void>()
    mergedObservable = mergeObservables(observableOne, observableTwo)
    subscriber = jasmine.createSpy('subscriber')
  })

  it('should notify when one of the merged observable notifies', () => {
    mergedObservable.subscribe(subscriber)
    observableOne.notify()
    observableTwo.notify()

    expect(subscriber).toHaveBeenCalledTimes(2)
  })

  it('should allow to unsubscribe to all merged observables', () => {
    const subscription = mergedObservable.subscribe(subscriber)

    subscription.unsubscribe()
    observableOne.notify()
    observableTwo.notify()

    expect(subscriber).not.toHaveBeenCalled()
  })
})
