import { evaluateCodeInActiveTab } from '../utils'
import { listenAction } from '../actions'
import { setLocalStore } from '../store'

interface BrowserWindow {
  DD_RUM?: {
    getInitConfiguration: () => any
  }
  DD_LOGS?: {
    getInitConfiguration: () => any
  }
}

listenAction('getConfig', (type) => {
  evaluateCodeInActiveTab((type) => {
    sendActionAsDomEvent('configReceived', {
      type,
      config:
        type === 'rum'
          ? (window as BrowserWindow).DD_RUM?.getInitConfiguration()
          : (window as BrowserWindow).DD_LOGS?.getInitConfiguration(),
    })

    function sendActionAsDomEvent(action: string, payload: any) {
      document.documentElement.dispatchEvent(
        new CustomEvent('extension', {
          detail: { action, payload },
        } as any)
      )
    }
  }, type)
})

listenAction('configReceived', ({ type, config }, tabId) => {
  if (tabId) {
    setLocalStore(type === 'rum' ? { rumConfig: config } : { logsConfig: config }, tabId)
  }
})
