import { computeStackTrace } from '../tools/stackTrace/computeStackTrace'
import { isEmptyObject } from '../tools/utils/objectUtils'
import { addTelemetryUsage } from './telemetry'

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
  const sourceCodeContext = (window as BrowserWindow).DD_SOURCE_CODE_CONTEXT
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
    if (url) {
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

export function getDebugIds(urls: string[]): { [url: string]: string } | undefined {
  syncSourceCodeContext()

  const debugIds: { [url: string]: string } = {}

  for (const url of urls) {
    const debugId = contextByUrl.get(url)?.ddDebugId
    if (debugId !== undefined) {
      debugIds[url] = debugId
    }
  }

  return isEmptyObject(debugIds) ? undefined : debugIds
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
