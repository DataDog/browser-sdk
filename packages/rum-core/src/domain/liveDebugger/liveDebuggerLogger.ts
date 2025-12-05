import type { Context } from '@datadog/browser-core'

interface BrowserWindow extends Window {
  DD_LOGS?: {
    logger?: {
      info: (message: string, context?: Context) => void
    }
  }
}

/**
 * Send a log event to Datadog logs from the live debugger.
 * This function checks if the Logs SDK is available and sends the log event.
 *
 * @param data - The data object to send as a log event
 */
export function sendLiveDebuggerLog(data: object): void {
  const browserWindow = window as BrowserWindow
  if (browserWindow.DD_LOGS?.logger?.info) {
    browserWindow.DD_LOGS.logger.info('Live Debugger event', {debuggerContext: data} as Context)
  }
}


