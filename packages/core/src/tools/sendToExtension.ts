declare const __BUILD_ENV__SDK_VERSION__: string

type ExtensionMessageType = 'logs' | 'record' | 'rum' | 'telemetry'

export function sendToExtension(type: ExtensionMessageType, payload: unknown) {
  // Only allow this for dev bundles for now, as it might impact performances?
  if (__BUILD_ENV__SDK_VERSION__ === 'dev') {
    window.dispatchEvent(
      new CustomEvent('__ddBrowserSdkMessage', {
        detail: { type, payload },
      })
    )
  }
}
