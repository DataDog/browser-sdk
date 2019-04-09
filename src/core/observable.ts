export class Observable<T> {
  private observers: Array<(data: T) => any> = []

  subscribe(f: (data: T) => any) {
    this.observers.push(f)
  }

  notify(data: T) {
    this.observers.forEach((observer) => observer(data))
  }
}
