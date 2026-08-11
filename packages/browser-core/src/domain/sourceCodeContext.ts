import { globalObject } from '@datadog/js-core/util'
import { computeStackTrace } from '../tools/stackTrace/computeStackTrace'
import { addTelemetryUsage } from './telemetry'

/**
 * Entry of the `DD_SOURCE_CODE_CONTEXT` map injected at build time. Depending on the build plugin
 * configuration, an entry can hold:
 * - service/version only (source code attribution),
 * - a debug ID only (sourcemap resolution),
 * - or both.
 */
export interface SourceCodeContextEntry {
  service?: string
  version?: string
  ddDebugId?: string
}

export interface BrowserWindow {
  DD_SOURCE_CODE_CONTEXT?: Record<string, SourceCodeContextEntry>
}

const contextByUrl = new Map<string, SourceCodeContextEntry>()
const processedStacks = new Set<string>()
let hasFiredTelemetry = false

function syncSourceCodeContext() {
  // globalObject.window is undefined in service worker environments
  const sourceCodeContext = (globalObject.window as BrowserWindow | undefined)?.DD_SOURCE_CODE_CONTEXT
  if (!sourceCodeContext) {
    return
  }

  let useDebugId = false
  let useService = false
  let useVersion = false

  for (const [stack, entry] of Object.entries(sourceCodeContext)) {
    useDebugId = useDebugId || entry.ddDebugId !== undefined
    useService = useService || entry.service !== undefined
    useVersion = useVersion || entry.version !== undefined

    if (processedStacks.has(stack)) {
      continue
    }

    processedStacks.add(stack)

    const url = computeStackTrace({ stack }).stack[0]?.url
    if (url && !contextByUrl.has(url)) {
      contextByUrl.set(url, entry)
    }
  }

  if (!hasFiredTelemetry) {
    hasFiredTelemetry = true
    addTelemetryUsage({
      feature: 'source-code-context',
      use_debug_id: useDebugId,
      use_service: useService,
      use_version: useVersion,
    })
  }
}

export interface DebugIdEntry {
  url: string
  id: string
}

export function buildDebugIdByUrl(urls: string[]): DebugIdEntry[] | undefined {
  syncSourceCodeContext()

  const seenUrls = new Set<string>()
  const debugIds: DebugIdEntry[] = []

  for (const url of urls) {
    if (seenUrls.has(url)) {
      continue
    }
    seenUrls.add(url)

    const debugId = contextByUrl.get(url)?.ddDebugId
    if (debugId !== undefined) {
      debugIds.push({ url, id: debugId })
    }
  }

  return debugIds.length ? debugIds : undefined
}

export function getSourceCodeContext(url: string): SourceCodeContextEntry | undefined {
  syncSourceCodeContext()
  return contextByUrl.get(url)
}

export function resetSourceCodeContext() {
  contextByUrl.clear()
  processedStacks.clear()
  hasFiredTelemetry = false
}
