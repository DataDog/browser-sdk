import type { BrowserWindow, SourceCodeContextEntry } from '../../src/domain/sourceCodeContext'
import { resetSourceCodeContext } from '../../src/domain/sourceCodeContext'
import { registerCleanupTask } from '../registerCleanupTask'

// Entries are keyed by stack — the context URL is the top frame URL of that stack
export function mockSourceCodeContext(entriesByStack: Record<string, SourceCodeContextEntry> = {}) {
  const browserWindow = window as BrowserWindow
  browserWindow.DD_SOURCE_CODE_CONTEXT = { ...entriesByStack }

  registerCleanupTask(() => {
    delete browserWindow.DD_SOURCE_CODE_CONTEXT
    resetSourceCodeContext()
  })

  return {
    addEntry(stack: string, entry: SourceCodeContextEntry) {
      browserWindow.DD_SOURCE_CODE_CONTEXT![stack] = entry
    },
  }
}
