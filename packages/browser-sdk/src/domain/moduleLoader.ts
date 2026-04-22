import type { Module } from '@datadog/core-next'

const MODULE_MAP: Record<string, string> = {
  rum: '@datadog/browser-rum-next/processor',
  logs: '@datadog/browser-logs-next/processor',
}

async function loadModules(configKeys: string[], explicitModules: Module[] = []): Promise<Module[]> {
  const explicitNames = new Set(explicitModules.map((m) => m.name))
  const dynamicModules: Module[] = []

  for (const key of configKeys) {
    if (explicitNames.has(key)) continue
    if (!MODULE_MAP[key]) continue
    try {
      const mod = await import(MODULE_MAP[key])
      dynamicModules.push(mod.default ?? mod[key])
    } catch {
      console.warn(`Failed to load module "${key}"`)
    }
  }

  return [...explicitModules, ...dynamicModules]
}

export { loadModules, MODULE_MAP }
