import { getEventBridge } from '@openobserve/browser-core'
import type { ProfilingPayload } from '../types'

export function createBridgeEmitter(): (payload: ProfilingPayload) => void {
  const bridge = getEventBridge<'profile', ProfilingPayload>()!
  return (payload: ProfilingPayload) => {
    bridge.send('profile', payload)
  }
}
