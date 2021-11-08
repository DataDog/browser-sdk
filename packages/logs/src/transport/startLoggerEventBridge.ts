import { Context, getEventBridge } from '@datadog/browser-core'

export function startLoggerEventBridge() {
  const bridge = getEventBridge()
  return (message: Context) => bridge.send('log', message)
}
