import { EventEmitter } from '../../utils'

interface ContextEvents {
  change: void
}

class ContextManager extends EventEmitter<ContextEvents> {
  private context: Record<string, unknown> = {}

  get(): Record<string, unknown> {
    return this.context
  }

  set(context: Record<string, unknown>): void {
    this.context = { ...context }
    this.emit('change')
  }

  setProperty(key: string, value: unknown): void {
    this.context = { ...this.context, [key]: value }
    this.emit('change')
  }

  removeProperty(key: string): void {
    const copy = { ...this.context }
    delete copy[key]
    this.context = copy
    this.emit('change')
  }

  clear(): void {
    this.context = {}
    this.emit('change')
  }
}

export { ContextManager }
