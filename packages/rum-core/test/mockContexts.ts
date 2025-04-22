import { noop } from '@datadog/browser-core'
import type { UrlContexts } from '../src/domain/contexts/urlContexts'
import type { ViewHistory, ViewHistoryEntry } from '../src/domain/contexts/viewHistory'

export function mockUrlContexts(fakeLocation: Location = location): UrlContexts {
  return {
    findUrl: () => ({
      url: fakeLocation.href,
      referrer: document.referrer,
    }),
    getAllEntries: () => [],
    getDeletedEntries: () => [],
    stop: noop,
  }
}

export function mockViewHistory(view?: Partial<ViewHistoryEntry>): ViewHistory {
  return {
    findView: () => view as ViewHistoryEntry,
    stop: noop,
    getAllEntries: () => [],
    getDeletedEntries: () => [],
  }
}
