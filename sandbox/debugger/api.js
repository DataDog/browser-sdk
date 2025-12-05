import { capture } from './capture.js'
import { getProbe, checkGlobalSnapshotBudget } from './probes.js'
import { captureStackTrace, parseStackTrace } from './stacktrace.js'
import { evaluateProbeMessage } from './template.js'
import { evaluateProbeCondition } from './condition.js'

/**
 * @typedef {Object} RumInternalContext
 * @property {string} [application_id]
 * @property {string} [session_id]
 * @property {{id: string}} [view]
 * @property {{id: string|string[]}} [user_action]
 */

/**
 * @typedef {Object} RumPublicApi
 * @property {string} version
 * @property {(message?: string, logger?: any, dd?: any, snapshot?: any) => void} liveDebug
 * @property {(startTime?: number) => RumInternalContext | undefined} [getInternalContext]
 */

/**
 * @type {Window & {DD_RUM?: RumPublicApi}}
 */
const globalWindow = window

const active = new Map()

export function onEntry (id, self, args) {
  const start = performance.now() // TODO: Can we trust this is available in browsers?
  let stack = active.get(id)
  if (!stack) {
    stack = []
    active.set(id, stack)
  }
  const probe = getProbe(id)

  // Skip if sampling budget is exceeded
  if (start - probe.lastCaptureMs < probe.msBetweenSampling || !checkGlobalSnapshotBudget(start, probe.captureSnapshot)) {
    stack.push(null)
    return
  }

  // Update last capture time
  probe.lastCaptureMs = start

  let timestamp, message
  if (probe.evaluateAt === 'ENTRY') {
    // Build context for condition and message evaluation
    const context = { this: self, ...args }

    // Check condition - if it fails, don't evaluate or capture anything
    if (!evaluateProbeCondition(probe, context)) {
      // Still push to stack so onReturn/onThrow can pop it, but mark as skipped
      stack.push(null)
      return
    }

    timestamp = Date.now()
    message = evaluateProbeMessage(probe, context)
  }

  // Special case for evaluateAt=EXIT with a condition: we only capture the return snapshot
  const shouldCaptureEntrySnapshot = probe.captureSnapshot && (probe.evaluateAt === 'ENTRY' || !probe.condition)
  const entry = shouldCaptureEntrySnapshot ? {
    arguments: { ...capture(args, probe.capture), this: capture(self, probe.capture) }
  } : undefined

  stack.push({
    start,
    timestamp,
    message,
    entry,
    stack: probe.captureSnapshot ? captureStackTrace(1) : undefined
  })
}

export function onReturn (id, value, self, args, locals) {
  const end = performance.now()
  const result = active.get(id).pop()
  if (result === null) return value
  const probe = getProbe(id)

  result.duration = end - result.start

  if (probe.evaluateAt === 'EXIT') {
    result.timestamp = Date.now()

    const context = {
      ...args,
      ...locals,
      this: self,
      '@duration': result.duration,
      '@return': value
    }

    if (!evaluateProbeCondition(probe, context)) return value

    result.message = evaluateProbeMessage(probe, context)
  }

  result.return = probe.captureSnapshot ? {
    arguments: { ...capture(args, probe.capture), this: capture(self, probe.capture) },
    locals: { ...capture(locals, probe.capture), '@return': capture(value, probe.capture) }
  } : undefined

  done(probe, result)

  return value
}

export function onThrow (id, error, self, args) {
  const end = performance.now()
  const result = active.get(id).pop()
  if (result === null) return
  const probe = getProbe(id)

  result.duration = end - result.start
  result.exception = error

  if (probe.evaluateAt === 'EXIT') {
    result.timestamp = Date.now()

    const context = {
      ...args,
      this: self,
      '@duration': result.duration,
      '@exception': error
    }

    if (!evaluateProbeCondition(probe, context)) return

    result.message = evaluateProbeMessage(probe, context)
  }

  result.return = {
    arguments: probe.captureSnapshot ? { ...capture(args, probe.capture), this: capture(self, probe.capture) } : undefined,
    throwable: {
      // type: error.type, // TODO: Support error type
      message: error.message,
      stacktrace: parseStackTrace(error)
    }
  }

  done(probe, result)
}

function done (probe, result) {
  const snapshot = {
    id: crypto.randomUUID(),
    timestamp: result.timestamp,
    probe: {
      id: probe.id,
      version: probe.version,
      location: probe.location
    },
    stack: result.stack,
    language: 'javascript',
    duration: result.duration * 1e6, // to nanoseconds
    captures: {
      entry: result.entry,
      return: result.return
    }
  }

  // Send the snapshot to the backend via liveDebug
  if (globalWindow.DD_RUM && typeof globalWindow.DD_RUM.liveDebug === 'function') {
    // TODO: Fill out logger with the right information
    const logger = {
      name: 'dd.debugger',
      method: probe.location?.method,
      thread_name: 'main', // Browser main thread
      thread_id: 1,
      version: globalWindow.DD_RUM.version
    }

    // Get the RUM internal context for trace correlation
    const rumContext = globalWindow.DD_RUM.getInternalContext?.()
    const dd = {
      trace_id: rumContext?.session_id,
      span_id: rumContext?.user_action?.id || rumContext?.view?.id
    }

    globalWindow.DD_RUM.liveDebug(result.message, logger, dd, snapshot)
  } else {
    console.warn('DD_RUM.liveDebug is not available. Make sure the RUM SDK is initialized.')
  }
}
