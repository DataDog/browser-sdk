import { InitConfiguration } from '../domain/configuration'
import { Context } from '../tools/context'

export interface BrowserWindow extends Window {
  DatadogEventBridge?: DatadogEventBridge
}

interface DatadogEventBridge {
  send(msg: string): void
}

export function getEventBridge() {
  const datadogEventBridge = getDatadogEventBridge()

  return {
    send(eventType: string, event: Context) {
      datadogEventBridge?.send(JSON.stringify({ eventType, event }))
    },
  }
}

export function isEventBridgeDetected(): boolean {
  return !!getDatadogEventBridge()
}

export function overrideInitConfigurationForBridge<C extends InitConfiguration>(initConfiguration: C): C {
  return { ...initConfiguration, applicationId: 'empty', clientToken: 'empty', sampleRate: 100 }
}

function getDatadogEventBridge() {
  return (window as BrowserWindow).DatadogEventBridge
}
