import { addTelemetryError, display, DOCS_ORIGIN } from '@datadog/browser-core'

export function reportScriptLoadingError({
  configuredUrl,
  error,
  source,
  scriptType,
}: {
  configuredUrl?: string | undefined
  error: unknown
  source: string
  scriptType: 'module' | 'worker'
}) {
  display.error(`${source} failed to start: an error occurred while initializing the ${scriptType}:`, error)
  if (error instanceof Event || (error instanceof Error && isMessageCspRelated(error.message))) {
    let baseMessage
    if (configuredUrl) {
      baseMessage = `Please make sure the ${scriptType} URL ${configuredUrl} is correct and CSP is correctly configured.`
    } else {
      baseMessage = 'Please make sure CSP is correctly configured.'
    }
    display.error(
      `${baseMessage} See documentation at ${DOCS_ORIGIN}/integrations/content_security_policy_logs/#use-csp-with-real-user-monitoring-and-session-replay`
    )
  } else if (scriptType === 'worker') {
    addTelemetryError(error)
  }
}

function isMessageCspRelated(message: string) {
  return (
    message.includes('Content Security Policy') ||
    // Related to `require-trusted-types-for` CSP: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/require-trusted-types-for
    message.includes("requires 'TrustedScriptURL'")
  )
}
