/**
 * Detects if the current environment is a Vercel Edge Runtime or similar
 * where dd-trace is not available.
 */
export function isEdgeRuntime(): boolean {
  return process.env.NEXT_RUNTIME === 'edge'
}

/**
 * Minimal span interface matching the subset we use from dd-trace.
 * Used as a fallback when dd-trace is not available in Edge Runtime.
 */
export interface EdgeSpan {
  setTag(key: string, value: any): void
  finish(): void
  context(): {
    toTraceId(): string
    toSpanId(): string
  }
}

export interface EdgeTracerOptions {
  /** Datadog API key (DD_API_KEY env var) */
  apiKey?: string
  /** Datadog site (e.g., 'datadoghq.com') */
  site?: string
  /** Service name */
  service?: string
  /** Environment */
  env?: string
  /** Version */
  version?: string
}

/**
 * Creates a lightweight edge-compatible tracer that sends traces
 * via HTTP to the Datadog intake.
 */
export function createEdgeTracer(options?: EdgeTracerOptions) {
  const apiKey = options?.apiKey ?? process.env.DD_API_KEY
  const site = options?.site ?? process.env.DD_SITE ?? 'datadoghq.com'
  const service = options?.service ?? process.env.DD_SERVICE
  const env = options?.env ?? process.env.DD_ENV ?? process.env.VERCEL_ENV
  const version = options?.version ?? process.env.DD_VERSION ?? process.env.VERCEL_GIT_COMMIT_SHA

  function generateId(): string {
    // Generate a random 64-bit hex ID using crypto
    const bytes = new Uint8Array(8)
    crypto.getRandomValues(bytes)
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }

  return {
    startSpan(operationName: string, spanOptions?: { tags?: Record<string, any> }): EdgeSpan {
      const traceId = generateId() + generateId() // 128-bit
      const spanId = generateId() // 64-bit
      const tags: Record<string, any> = { ...spanOptions?.tags }
      // eslint-disable-next-line no-restricted-syntax
      const startTime = Date.now()

      return {
        setTag(key: string, value: any) {
          tags[key] = value
        },
        finish() {
          // eslint-disable-next-line no-restricted-syntax
          const duration = Date.now() - startTime

          if (!apiKey) {
            // No API key — can't send. Silently drop.
            return
          }

          // Fire and forget — don't block the response
          const payload = [
            {
              service: service ?? operationName,
              name: operationName,
              resource: tags['resource.name'] ?? operationName,
              trace_id: traceId,
              span_id: spanId,
              start: startTime * 1_000_000, // nanoseconds
              duration: duration * 1_000_000,
              error: tags.error ? 1 : 0,
              meta: {
                ...Object.fromEntries(Object.entries(tags).filter(([, v]) => typeof v === 'string')),
                ...(env ? { env } : {}),
                ...(version ? { version } : {}),
              },
              metrics: {
                ...Object.fromEntries(Object.entries(tags).filter(([, v]) => typeof v === 'number')),
              },
            },
          ]

          const intakeUrl = `https://trace.browser-intake-${site}/api/v2/spans`

          // eslint-disable-next-line local-rules/disallow-zone-js-patched-values
          fetch(intakeUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'DD-API-KEY': apiKey,
            },
            body: JSON.stringify({ data: payload }),
          }).catch(() => {
            // Silently ignore send failures in edge runtime
          })
        },
        context() {
          return {
            toTraceId: () => traceId,
            toSpanId: () => spanId,
          }
        },
      }
    },
  }
}
