// This script is executed in the "main" execution world, the same world as the webpage. Thus, it
// can define a global callback variable to listen to SDK events.

;(window as any).__ddBrowserSdkExtensionCallback = (message: unknown) => {
  // Relays any message to the "isolated" content-script via a custom event.
  window.dispatchEvent(
    new CustomEvent('__ddBrowserSdkMessage', {
      detail: message,
    })
  )
}
