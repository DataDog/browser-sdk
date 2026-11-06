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
  // Read `navigator.connection` only once: some environments expose it through a getter that does
  // not always return the same value (it can return `null` on a later read).
  const connection = navigator?.connection

  return {
    status: navigator?.onLine ? 'connected' : 'not_connected',
    interfaces: connection?.type ? [connection.type] : undefined,
    effective_type: connection?.effectiveType,
  }
}
