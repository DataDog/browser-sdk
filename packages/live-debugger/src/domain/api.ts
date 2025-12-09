import type { Context } from '@datadog/browser-core'
import type { RumPublicApi } from '@datadog/browser-rum-core'
import { timeStampNow, ErrorSource, display, buildTags, buildTag } from '@datadog/browser-core'
import type { LiveDebuggerPublicApi } from '../entries/main'
import { capture, captureFields } from './capture'
import type { InitializedProbe } from './probes'
import { checkGlobalSnapshotBudget } from './probes'
import { captureStackTrace, parseStackTrace } from './stacktrace'
import type { StackFrame } from './stacktrace'
import { evaluateProbeMessage } from './template'
import { evaluateProbeCondition } from './condition'

interface ActiveEntry {
  start: number
  timestamp?: number
  message?: string
  entry?: {
    arguments: Record<string, any>
  }
  stack?: StackFrame[]
  duration?: number
  return?: {
    arguments?: Record<string, any>
    locals?: Record<string, any>
    throwable?: {
      message: string
      stacktrace: StackFrame[]
    }
  }
  exception?: Error
}

interface BrowserWindow extends Window {
  DD_LOGS?: {
    logger?: {
      info: (message: string, context?: Context) => void
    }
    sendRawLog?: (log: any) => void
    getInitConfiguration?: () =>
      | {
          service?: string
          env?: string
          version?: string
          datacenter?: string
        }
      | undefined
  }
  DD_LIVE_DEBUGGER?: LiveDebuggerPublicApi
}

const active = new Map<string, Array<ActiveEntry | null>>()

// Cache hostname at module initialization since it won't change during the app lifetime
const hostname = typeof window !== 'undefined' && window.location ? window.location.hostname : 'unknown'

const serviceVersion = `1.0.0-${crypto.randomUUID().slice(0, 8)}` // eslint-disable-line local-rules/disallow-side-effects

const threadName = detectThreadName() // eslint-disable-line local-rules/disallow-side-effects

// Lazy cache for application_id - once RUM is initialized, this won't change
let cachedApplicationId: string | undefined | null = null // null = not yet fetched, undefined = no app_id available

// Track if we've already warned about missing DD_LOGS to avoid spam
let hasWarnedAboutMissingLogs = false

/**
 * Called when entering an instrumented function
 *
 * @param probes - Array of probes for this function
 * @param self - The 'this' context
 * @param args - Function arguments
 */
export function onEntry(probes: InitializedProbe[], self: any, args: Record<string, any>): void {
  const start = performance.now()

  // TODO: A lot of repeated work performed for each probe that could be shared between probes
  for (const probe of probes) {
    let stack = active.get(probe.id) // TODO: Should we use the functionId instead?
    if (!stack) {
      stack = []
      active.set(probe.id, stack)
    }

    // Skip if sampling budget is exceeded
    if (
      start - probe.lastCaptureMs < probe.msBetweenSampling ||
      !checkGlobalSnapshotBudget(start, probe.captureSnapshot)
    ) {
      stack.push(null)
      continue
    }

    // Update last capture time
    probe.lastCaptureMs = start

    let timestamp: number | undefined
    let message: string | undefined
    if (probe.evaluateAt === 'ENTRY') {
      // Build context for condition and message evaluation
      const context = { ...args, this: self }

      // Check condition - if it fails, don't evaluate or capture anything
      if (!evaluateProbeCondition(probe, context)) {
        // Still push to stack so onReturn/onThrow can pop it, but mark as skipped
        stack.push(null)
        continue
      }

      timestamp = timeStampNow()
      message = evaluateProbeMessage(probe, context)
    }

    // Special case for evaluateAt=EXIT with a condition: we only capture the return snapshot
    const shouldCaptureEntrySnapshot = probe.captureSnapshot && (probe.evaluateAt === 'ENTRY' || !probe.condition)
    const entry = shouldCaptureEntrySnapshot
      ? {
          arguments: {
            ...captureFields(args, probe.capture),
            this: capture(self, probe.capture),
          },
        }
      : undefined

    stack.push({
      start,
      timestamp,
      message,
      entry,
      stack: probe.captureSnapshot ? captureStackTrace(1) : undefined,
    })
  }
}

/**
 * Called when exiting an instrumented function normally
 *
 * @param probes - Array of probes for this function
 * @param value - Return value
 * @param self - The 'this' context
 * @param args - Function arguments
 * @param locals - Local variables
 * @returns The return value (passed through)
 */
export function onReturn(
  probes: InitializedProbe[],
  value: any,
  self: any,
  args: Record<string, any>,
  locals: Record<string, any>
): any {
  const end = performance.now()

  // TODO: A lot of repeated work performed for each probe that could be shared between probes
  for (const probe of probes) {
    const stack = active.get(probe.id) // TODO: Should we use the functionId instead?
    if (!stack) {
      continue // TODO: This shouldn't be possible, do we need it? Should we warn?
    }
    const result = stack.pop()
    if (!result) {
      continue
    }

    result.duration = end - result.start

    if (probe.evaluateAt === 'EXIT') {
      result.timestamp = timeStampNow()

      const context = {
        ...args,
        ...locals,
        this: self,
        $dd_duration: result.duration,
        $dd_return: value,
      }

      if (!evaluateProbeCondition(probe, context)) {
        continue
      }

      result.message = evaluateProbeMessage(probe, context)
    }

    result.return = probe.captureSnapshot
      ? {
          arguments: {
            ...captureFields(args, probe.capture),
            this: capture(self, probe.capture),
          },
          locals: {
            ...captureFields(locals, probe.capture),
            '@return': capture(value, probe.capture),
          },
        }
      : undefined

    sendDebuggerSnapshot(probe, result)
  }

  return value
}

/**
 * Called when exiting an instrumented function via exception
 *
 * @param probes - Array of probes for this function
 * @param error - The thrown error
 * @param self - The 'this' context
 * @param args - Function arguments
 */
export function onThrow(probes: InitializedProbe[], error: Error, self: any, args: Record<string, any>): void {
  const end = performance.now()

  // TODO: A lot of repeated work performed for each probe that could be shared between probes
  for (const probe of probes) {
    const stack = active.get(probe.id) // TODO: Should we use the functionId instead?
    if (!stack) {
      continue // TODO: This shouldn't be possible, do we need it? Should we warn?
    }
    const result = stack.pop()
    if (!result) {
      continue
    }

    result.duration = end - result.start
    result.exception = error

    if (probe.evaluateAt === 'EXIT') {
      result.timestamp = timeStampNow()

      const context = {
        ...args,
        this: self,
        $dd_duration: result.duration,
        $dd_exception: error,
      }

      if (!evaluateProbeCondition(probe, context)) {
        continue
      }

      result.message = evaluateProbeMessage(probe, context)
    }

    result.return = {
      arguments: probe.captureSnapshot
        ? {
            ...captureFields(args, probe.capture),
            this: capture(self, probe.capture),
          }
        : undefined,
      throwable: {
        message: error.message,
        stacktrace: parseStackTrace(error),
      },
    }

    sendDebuggerSnapshot(probe, result)
  }
}

/**
 * Send a debugger snapshot to Datadog logs, matching dd-trace-js send method signature.
 * This function sends debugger snapshot logs directly to the logs endpoint without default RUM context.
 *
 * @param probe - The probe that was executed
 * @param result - The result of the probe execution
 */
function sendDebuggerSnapshot(probe: any, result: ActiveEntry): void {
  const snapshot = {
    id: crypto.randomUUID(),
    timestamp: result.timestamp!,
    probe: {
      id: probe.id,
      version: probe.version,
      location: {
        // TODO: Are our hardcoded where.* keys correct according to the spec?
        method: probe.where.methodName,
        type: probe.where.typeName,
      },
    },
    stack: result.stack,
    language: 'javascript',
    duration: result.duration! * 1e6, // to nanoseconds
    captures:
      result.entry || result.return
        ? {
            entry: result.entry,
            return: result.return,
          }
        : undefined,
  }

  const rumApi = (window as Window & { DD_RUM?: RumPublicApi }).DD_RUM
  const liveDebuggerApi = (window as BrowserWindow).DD_LIVE_DEBUGGER

  // TODO: Fill out logger with the right information
  const logger = {
    name: probe.where.typeName,
    method: probe.where.methodName,
    version: liveDebuggerApi?.version,
    // thread_id: 1,
    thread_name: threadName,
  }

  // Get the RUM internal context for trace correlation
  const rumContext = rumApi?.getInternalContext?.()
  const dd = {
    trace_id: rumContext?.session_id,
    span_id: rumContext?.user_action?.id || rumContext?.view?.id,
  }

  const browserWindow = window as BrowserWindow

  if (!browserWindow.DD_LOGS?.sendRawLog) {
    if (!hasWarnedAboutMissingLogs) {
      display.warn(
        'DD_LOGS.sendRawLog is not available. Make sure the Logs SDK is initialized to send debugger snapshots.'
      )
      hasWarnedAboutMissingLogs = true
    }
    return
  }

  // Get init configuration from logs SDK (defined during DD_LOGS.init())
  const initConfig = browserWindow.DD_LOGS.getInitConfiguration?.()
  const service = initConfig?.service

  // Get application_id from RUM internal context if available (same way regular loggers get it)
  // Only cache if we get a value or confirm RUM is initialized (to handle late RUM initialization)
  // TODO: Maybe don't keep re-trying if it fails?
  if (cachedApplicationId === null) {
    const ddRum = (window as any).DD_RUM
    if (ddRum && typeof ddRum.getInternalContext === 'function') {
      try {
        const getInternalContext = ddRum.getInternalContext as (
          startTime?: number
        ) => { application_id?: string } | undefined
        const rumInternalContext = getInternalContext()
        cachedApplicationId = rumInternalContext?.application_id
      } catch {
        // ignore
      }
    }
  }

  // Build ddtags array - sendRawLog bypasses assembly so we need to manually add all tags
  // Use buildTags to get all configuration tags (env, service, version, datacenter, variant, sdk_version)
  // Then add source:dd_debugger tag to identify these as debugger logs
  const configTags = initConfig ? buildTags(initConfig as any) : []
  const ddtags = configTags.concat(
    // buildTag('source', 'dd_debugger'),
    buildTag('version', serviceVersion),
    buildTag('debugger_version', liveDebuggerApi?.version),
    buildTag('host_name', hostname) // TODO: Is this needed?
    // buildTag('git.commit.sha', 'fd8163131f3150b86b792eee85eb583df81615da'),
    // buildTag('git.repository_url', 'https://github.com/datadog/debugger-demos'),
  )

  const payload = {
    date: (snapshot as any).timestamp, // TODO: This isn't in the backend tracer payloads
    message: result.message || '',
    status: 'info' as const,
    origin: ErrorSource.LOGGER, // TODO: This isn't in the backend tracer payloads
    hostname,
    ...(service && { service }),
    ...(ddtags.length > 0 && { ddtags: ddtags.join(',') }),
    ...(cachedApplicationId && { application_id: cachedApplicationId }), // TODO: Is this even needed?
    logger,
    dd,
    debugger: { snapshot },
  }

  browserWindow.DD_LOGS.sendRawLog(payload)
}

function detectThreadName() {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return 'main'
  }
  if (typeof ServiceWorkerGlobalScope !== 'undefined' && self instanceof ServiceWorkerGlobalScope) {
    return 'service-worker'
  }
  if (typeof importScripts === 'function') {
    return 'web-worker'
  }
  return 'unknown'
}
