import type { NetworkEffectiveType, NetworkInterface } from '@datadog/js-core/util'
import { globalObject } from '@datadog/js-core/util'

export interface Connectivity {
  status: 'connected' | 'not_connected'
  interfaces?: NetworkInterface[]
  effective_type?: NetworkEffectiveType
  [key: string]: unknown
}

export function getConnectivity(): Connectivity {
  const { navigator } = globalObject

  return {
    status: navigator?.onLine ? 'connected' : 'not_connected',
    interfaces: navigator?.connection?.type ? [navigator.connection.type] : undefined,
    effective_type: navigator?.connection?.effectiveType,
  }
}
