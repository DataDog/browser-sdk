import { createSdk } from '../domain/sdk'
import type { SdkInitConfiguration } from '../domain/sdk'

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

function initCdn(config: SdkInitConfiguration): void {
  const target = getTargetGlobal()
  void createSdk(config).then((sdk) => {
    if (sdk) {
      ;(globalThis as any)[target] = sdk
    }
  })
}

export { getTargetGlobal, initCdn }
