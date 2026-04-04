const instances = new Map<string, unknown>()

function registerSdk(id: string, sdk: unknown): void {
  instances.set(id, sdk)
}

function getSdk<T = unknown>(id: string = 'default'): T | undefined {
  return instances.get(id) as T | undefined
}

function unregisterSdk(id: string = 'default'): void {
  instances.delete(id)
}

export { registerSdk, getSdk, unregisterSdk }
