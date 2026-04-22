import { createSdk } from '../domain/sdk'
import type { SdkInitConfiguration } from '../domain/sdk'
import type { Module } from '@datadog/core-next'

function getTargetGlobal(): string {
  const script = document.currentScript as HTMLScriptElement | null
  if (script?.src) {
    try {
      const url = new URL(script.src)
      return url.searchParams.get('target') ?? 'DD_SDK'
    } catch {
      return 'DD_SDK'
    }
  }
  return 'DD_SDK'
}

// CDN base URL for module scripts — TBD, exact conventions to be finalized
const CDN_BASE_URL = 'https://cdn.datadoghq.com/v8/modules'

async function resolveModuleFromCdn(name: string): Promise<Module> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${CDN_BASE_URL}/${name}.js`
    script.onload = () => {
      // CDN modules are expected to register themselves on globalThis
      const mod = (globalThis as any)[`DD_MODULE_${name.toUpperCase()}`]
      if (mod) {
        resolve(mod as Module)
      } else {
        reject(new Error(`CDN module "${name}" did not register itself`))
      }
    }
    script.onerror = () => reject(new Error(`Failed to load CDN module "${name}"`))
    document.head.appendChild(script)
  })
}

function initCdn(config: SdkInitConfiguration): void {
  const target = getTargetGlobal()
  void createSdk({
    ...config,
    resolveModule: resolveModuleFromCdn,
  }).then((sdk) => {
    if (sdk) {
      ;(globalThis as any)[target] = sdk
    }
  })
}

export { getTargetGlobal, initCdn, resolveModuleFromCdn }
