import type { Pipeline } from '../pipeline'

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

interface Bridge {
  connect(pipeline: Pipeline<Record<string, unknown>>): void
}

const bridges = new Map<string, Bridge>()

function registerBridge(name: string, bridge: Bridge): void {
  bridges.set(name, bridge)
}

function connectBridges(pipeline: Pipeline<Record<string, unknown>>): void {
  for (const bridge of bridges.values()) {
    bridge.connect(pipeline)
  }
}

export { registerSdk, getSdk, unregisterSdk, registerBridge, connectBridges }
export type { Bridge }
