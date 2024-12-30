import { noop } from '@datadog/browser-core'
import type { PageStateHistory } from '../src/domain/contexts/pageStateHistory'

export function mockPageStateHistory(partialPageStateHistory?: Partial<PageStateHistory>): PageStateHistory {
  const pageStateHistory: PageStateHistory = {
    findAll: () => undefined,
    addPageState: noop,
    stop: noop,
    wasInPageStateAt: () => false,
    wasInPageStateDuringPeriod: () => false,
    ...partialPageStateHistory,
  }

  return pageStateHistory
}
