import type { EffectiveType, NetworkInterface } from '../../browser/browser.types'
import { globalObject } from '../../tools/globalObject'

export interface Connectivity {
  status: 'connected' | 'not_connected'
  interfaces?: NetworkInterface[]
  effective_type?: EffectiveType
  [key: string]: unknown
}

export function getConnectivity(): Connectivity {
  const navigator = globalObject.navigator

  return {
    status: navigator.onLine ? 'connected' : 'not_connected',
    interfaces: navigator.connection?.type ? [navigator.connection.type] : undefined,
    effective_type: navigator.connection?.effectiveType,
  }
}
