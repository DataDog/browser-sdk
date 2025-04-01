export interface Subscription {
  unsubscribe: () => void
}

// eslint-disable-next-line no-restricted-syntax
export class Observable<T> {
  private observers: Array<(data: T) => void> = []
  private onLastUnsubscribe?: () => void

  constructor(private onFirstSubscribe?: (observable: Observable<T>) => (() => void) | void) {}

  subscribe(f: (data: T) => void): Subscription {
    this.observers.push(f)
    
    if (this.observers.length === 1 && this.onFirstSubscribe) {
      try {
        this.onLastUnsubscribe = this.onFirstSubscribe(this) || undefined
      } catch (error) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('Error in Observable.onFirstSubscribe:', error);
        }
        
        this.onLastUnsubscribe = undefined;
      }
    }
    
    return {
      unsubscribe: () => {
        this.observers = this.observers.filter((other) => f !== other)
        if (!this.observers.length && this.onLastUnsubscribe) {
          try {
            this.onLastUnsubscribe()
          } catch (error) {
            if (typeof console !== 'undefined' && console.error) {
              console.error('Error in Observable.onLastUnsubscribe:', error);
            }
          }
        }
      },
    }
  }

  notify(data: T) {
    this.observers.forEach((observer) => {
      try {
        observer(data)
      } catch (error) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('Error in Observable.notify observer:', error);
        }
      }
    })
  }
}

export function mergeObservables<T>(...observables: Array<Observable<T>>) {
  return new Observable<T>((globalObservable) => {
    const subscriptions: Subscription[] = [];
    
    observables.forEach((observable) => {
      try {
        const subscription = observable.subscribe((data) => globalObservable.notify(data));
        subscriptions.push(subscription);
      } catch (error) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('Error subscribing to merged observable:', error);
        }
      }
    });
    
    return () => subscriptions.forEach((subscription) => {
      try {
        subscription.unsubscribe();
      } catch (error) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('Error unsubscribing from merged observable:', error);
        }
      }
    });
  })
}
