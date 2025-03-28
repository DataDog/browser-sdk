import { noop } from '@datadog/browser-core'
import type { ActionContexts } from '../src/domain/action/trackClickActions'
import type { DisplayContext } from '../src/domain/contexts/displayContext'
import type { UrlContexts } from '../src/domain/contexts/urlContexts'
import type { ViewHistory, ViewHistoryEntry } from '../src/domain/contexts/viewHistory'
import type { FeatureFlagContexts } from '../src/domain/contexts/featureFlagContext'

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

export function mockActionContexts(): ActionContexts {
  return {
    findActionId: () => '7890',
  }
}

export function mockDisplayContext(): DisplayContext {
  return {
    get: () => ({ viewport: { height: 0, width: 0 } }),
    stop: noop,
  }
}

export function mockFeatureFlagContexts(partialContext: Partial<FeatureFlagContexts> = {}): FeatureFlagContexts {
  return {
    addFeatureFlagEvaluation: noop,
    ...partialContext,
  }
}
