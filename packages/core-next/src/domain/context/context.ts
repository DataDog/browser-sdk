import { EventEmitter } from '../../utils'

type AnyObject = Record<string, unknown>

type ContextEvents<T> = {
  change: T
}

class ContextManager<T extends AnyObject = AnyObject> extends EventEmitter<ContextEvents<T>> {
  private context: T = {} as T

  get(): T {
    return this.context
  }

  set(context: T): void {
    this.context = { ...context }
    this.emit('change', this.context)
  }

  setProperty<K extends keyof T>(key: K, value: T[K]): void {
    this.set({ ...this.context, [key]: value })
  }

  removeProperty(key: keyof T): void {
    const copy = { ...this.context }
    delete copy[key]
    this.set(copy)
  }

  clear(): void {
    this.set({} as T)
  }
}

export { ContextManager }
