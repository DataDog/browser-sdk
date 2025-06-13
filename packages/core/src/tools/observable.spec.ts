import { BufferedObservable, mergeObservables, Observable } from './observable'

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

  it('should notify the first subscriber if the onFirstSubscribe callback notifies synchronously ', () => {
    const onFirstSubscribe = jasmine.createSpy('callback').and.callFake((observable: Observable<void>) => {
      observable.notify()
    })
    observable = new Observable(onFirstSubscribe)
    observable.subscribe(subscriber)

    expect(onFirstSubscribe).toHaveBeenCalledTimes(1)
    expect(subscriber).toHaveBeenCalledTimes(1)
  })

  it('should pass the observable instance to the onFirstSubscribe callback', () => {
    const onFirstSubscribe = jasmine.createSpy('callback')
    observable = new Observable(onFirstSubscribe)
    observable.subscribe(subscriber)

    expect(onFirstSubscribe).toHaveBeenCalledWith(observable)
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

describe('BufferedObservable', () => {
  it('invokes the observer with buffered data', async () => {
    const observable = new BufferedObservable<string>(100)
    observable.notify('first')
    observable.notify('second')

    const observer = jasmine.createSpy('observer')
    observable.subscribe(observer)

    await nextMicroTask()

    expect(observer).toHaveBeenCalledTimes(2)
  })

  it('invokes the observer asynchronously', async () => {
    const observable = new BufferedObservable<string>(100)
    observable.notify('first')

    const observer = jasmine.createSpy('observer')
    observable.subscribe(observer)

    expect(observer).not.toHaveBeenCalled()

    await nextMicroTask()

    expect(observer).toHaveBeenCalledWith('first')
  })

  it('invokes the observer when new data is notified after subscription', async () => {
    const observable = new BufferedObservable<string>(100)

    const observer = jasmine.createSpy('observer')
    observable.subscribe(observer)

    observable.notify('first')

    await nextMicroTask()

    observable.notify('second')

    expect(observer).toHaveBeenCalledTimes(2)
    expect(observer).toHaveBeenCalledWith('first')
    expect(observer).toHaveBeenCalledWith('second')
  })

  it('drops data when the buffer is full', async () => {
    const observable = new BufferedObservable<string>(2)
    observable.notify('first') // This should be dropped
    observable.notify('second')
    observable.notify('third')

    const observer = jasmine.createSpy('observer')
    observable.subscribe(observer)

    await nextMicroTask()

    expect(observer).toHaveBeenCalledTimes(2)
    expect(observer).toHaveBeenCalledWith('second')
    expect(observer).toHaveBeenCalledWith('third')
  })

  it('allows to unsubscribe from the observer, the middle of buffered data', async () => {
    const observable = new BufferedObservable<string>(100)
    observable.notify('first')
    observable.notify('second')

    const observer = jasmine.createSpy('observer').and.callFake(() => {
      subscription.unsubscribe()
    })
    const subscription = observable.subscribe(observer)

    await nextMicroTask()

    expect(observer).toHaveBeenCalledTimes(1)
  })

  it('allows to unsubscribe before the buffered data', async () => {
    const observable = new BufferedObservable<string>(100)
    observable.notify('first')

    const observer = jasmine.createSpy('observer')
    const subscription = observable.subscribe(observer)

    subscription.unsubscribe()

    await nextMicroTask()

    expect(observer).not.toHaveBeenCalled()
  })

  it('allows to unsubscribe after the buffered data', async () => {
    const observable = new BufferedObservable<string>(100)

    const observer = jasmine.createSpy('observer')
    const subscription = observable.subscribe(observer)

    await nextMicroTask()

    subscription.unsubscribe()

    observable.notify('first')

    expect(observer).not.toHaveBeenCalled()
  })

  it('calling unbuffer() removes buffered data', async () => {
    const observable = new BufferedObservable<string>(2)
    observable.notify('first')
    observable.notify('second')

    observable.unbuffer()
    await nextMicroTask()

    const observer = jasmine.createSpy('observer')
    observable.subscribe(observer)
    await nextMicroTask()

    expect(observer).not.toHaveBeenCalled()
  })

  it('when calling unbuffer() right after subscription, buffered data should still be notified', async () => {
    const observable = new BufferedObservable<string>(2)
    observable.notify('first')
    observable.notify('second')

    const observer = jasmine.createSpy('observer')
    observable.subscribe(observer)

    observable.unbuffer()
    await nextMicroTask()

    expect(observer).toHaveBeenCalledTimes(2)
    expect(observer).toHaveBeenCalledWith('first')
    expect(observer).toHaveBeenCalledWith('second')
  })
})

function nextMicroTask() {
  return Promise.resolve()
}
