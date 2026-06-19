import { computeStackTrace } from '../tools/stackTrace/computeStackTrace'
import { isEmptyObject } from '../tools/utils/objectUtils'

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

function syncSourceCodeContext() {
  const sourceCodeContext = (window as BrowserWindow).DD_SOURCE_CODE_CONTEXT
  if (!sourceCodeContext) {
    return
  }

  for (const [stack, entry] of Object.entries(sourceCodeContext)) {
    if (processedStacks.has(stack)) {
      continue
    }

    processedStacks.add(stack)

    const url = computeStackTrace({ stack }).stack[0]?.url
    if (url) {
      contextByUrl.set(url, entry)
    }
  }
}

export function getDebugIds(urls: string[]): Record<string, string> | undefined {
  syncSourceCodeContext()

  const debugIds: Record<string, string> = {}

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
}
