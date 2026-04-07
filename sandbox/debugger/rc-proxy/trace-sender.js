/**
 * Trace Sender Module
 *
 * Sends dummy traces to the Datadog Agent trace intake API
 */

/**
 * Generate a random 64-bit ID as a number
 */
function generateId() {
  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
}

/**
 * Get current time in nanoseconds since epoch
 */
function getCurrentTimeNanos() {
  return Date.now() * 1000000 // Convert milliseconds to nanoseconds
}

/**
 * Create a dummy span payload
 *
 * @param {string} service - Service name for the span
 * @param {string} env - Environment for the span
 */
function createDummySpan(service, env) {
  const traceId = generateId()
  const spanId = generateId()
  const now = getCurrentTimeNanos()

  return {
    trace_id: traceId,
    span_id: spanId,
    parent_id: 0,
    service: service,
    name: 'proxy.client_registered',
    resource: 'client_registration_healthcheck',
    start: now,
    duration: 1000000, // 1ms in nanoseconds
    error: 0,
    meta: {
      env: env || 'none',
      proxy_type: 'rc-proxy-client-registration',
      'git.repository_url': 'https://github.com/watson/browser-sdk',
      'git.commit.sha': '7399fd1dc9cbdaa2ba414b741b8324655b321762',
    },
    metrics: {
      _sampling_priority_v1: 1,
    },
    type: 'custom',
  }
}

/**
 * Send a dummy trace to the agent
 *
 * @param {string} agentUrl - Base URL of the Datadog agent (e.g., http://localhost:8126)
 * @param {string} service - Service name for the span
 * @param {string} env - Environment for the span
 * @returns {Promise<boolean>} - Returns true if successful, false otherwise
 */
export async function sendDummyTrace(agentUrl, service, env) {
  try {
    const span = createDummySpan(service, env)
    const payload = [[span]] // Array of traces, each trace is an array of spans

    // The agent trace intake endpoint
    const traceUrl = `${agentUrl}/v0.4/traces`

    console.log(`[TraceHealthCheck] Sending dummy trace for client: ${service} (${env || 'none'})...`)

    const response = await fetch(traceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Datadog-Meta-Tracer-Version': '1.0.0',
        'Datadog-Meta-Lang': 'javascript',
        'X-Datadog-Trace-Count': '1',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000), // 5 second timeout
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[TraceHealthCheck] Failed to send trace: ${response.status} ${response.statusText}`)
      console.error(`[TraceHealthCheck] Response: ${errorText}`)
      return false
    }

    console.log('[TraceHealthCheck] ✅ Dummy trace sent successfully')
    console.log(`[TraceHealthCheck] Trace ID: ${span.trace_id}`)
    return true
  } catch (err) {
    if (err.cause?.code === 'ECONNREFUSED') {
      console.error(
        `[TraceHealthCheck] Cannot connect to agent at ${agentUrl} - connection refused. Is the agent running?`
      )
    } else if (err.name === 'TimeoutError' || err.cause?.code === 'ETIMEDOUT') {
      console.error(`[TraceHealthCheck] Agent request timed out at ${agentUrl}. The agent may be unreachable.`)
    } else if (err.cause?.code === 'ENOTFOUND') {
      console.error(`[TraceHealthCheck] Cannot resolve hostname for agent at ${agentUrl}. Check the agent URL.`)
    } else {
      console.error('[TraceHealthCheck] Error sending dummy trace:', err.message)
    }
    return false
  }
}

export default { sendDummyTrace }
