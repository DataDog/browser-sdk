import type { Context } from '@datadog/browser-core'
import { timeStampNow, ErrorSource } from '@datadog/browser-core'

interface BrowserWindow extends Window {
  DD_LOGS?: {
    logger?: {
      info: (message: string, context?: Context) => void
    }
    sendRawLog?: (log: any) => void
    getInitConfiguration?: () => { service?: string } | undefined
  }
}

const MAX_MESSAGE_LENGTH = 8 * 1024 // 8KB

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

/**
 * Send a debug log event to Datadog logs from the live debugger, matching dd-trace-js send method signature.
 * This function sends logs directly without default RUM context, bypassing assembly.
 *
 * @param message - The log message (will be truncated to 8KB if needed)
 * @param logger - Logger information
 * @param dd - Datadog context information
 * @param snapshot - Debugger snapshot data
 */
export function liveDebug(message?: string, logger?: any, dd?: any, snapshot?: any): void {
  const browserWindow = window as BrowserWindow
  
  if (!browserWindow.DD_LOGS?.sendRawLog) {
    return
  }

  // Get hostname from browser
  const hostname = typeof window !== 'undefined' && window.location ? window.location.hostname : 'unknown'
  
  // Get service from logs initialization configuration (defined during DD_LOGS.init())
  const initConfig = browserWindow.DD_LOGS.getInitConfiguration?.()
  const service = initConfig?.service

  // Get application_id from RUM internal context if available (same way regular loggers get it)
  let applicationId: string | undefined
  try {
    const ddRum = (window as any).DD_RUM
    if (ddRum && typeof ddRum.getInternalContext === 'function') {
      const getInternalContext = ddRum.getInternalContext as (startTime?: number) => { application_id?: string } | undefined
      const rumInternalContext = getInternalContext()
      applicationId = rumInternalContext?.application_id
    }
  } catch {
    // Ignore errors when accessing RUM context
  }

  // Truncate message to 8KB if needed
  const truncatedMessage =
    message && message.length > MAX_MESSAGE_LENGTH ? `${message.slice(0, MAX_MESSAGE_LENGTH)}…` : message

  // Construct payload matching dd-trace-js structure
  const payload = {
    date: timeStampNow(),
    message: truncatedMessage || '',
    status: 'info' as const,
    origin: ErrorSource.LOGGER,
    ddsource: 'dd_debugger',
    hostname,
    ...(service && { service }),
    ...(applicationId && { application_id: applicationId }),
    logger,
    dd,
    debugger: { snapshot },
  }

  browserWindow.DD_LOGS.sendRawLog(payload)
}


