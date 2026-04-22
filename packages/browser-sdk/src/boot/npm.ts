import { createSdk } from '../domain/sdk'
import type { Module } from '@datadog/core-next'
import type { SdkInitConfiguration } from '../domain/sdk'

const moduleMap: Record<string, () => Promise<Record<string, unknown>>> = {
  logs: () => import('@datadog/browser-logs-next/processor') as Promise<Record<string, unknown>>,
  rum: () => import('@datadog/browser-rum-next/processor') as Promise<Record<string, unknown>>,
}

async function resolveModule(name: string): Promise<Module> {
  const loader = moduleMap[name]
  if (!loader) {
    throw new Error(`Unknown module: ${name}`)
  }
  const mod = await loader()
  // Processor entries export a named export like logsProcessor or rumProcessor
  const found = Object.values(mod).find((v: any) => v?.name === name)
  if (!found) {
    throw new Error(`Module "${name}" not found in processor entry`)
  }
  return found as Module
}

function init(config: SdkInitConfiguration) {
  return createSdk({
    ...config,
    resolveModule,
  })
}

export { init, resolveModule }
