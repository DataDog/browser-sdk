export class Observable<T> {
  private observers: Array<(data: T) => void> = []

  subscribe(f: (data: T) => void) {
    this.observers.push(f)
  }

  notify(data: T) {
    this.observers.forEach((observer) => observer(data))
  }
}
