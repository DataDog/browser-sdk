import { noop } from '@datadog/browser-core'
import type { PageStateHistory } from '../src/domain/contexts/pageStateHistory'

export function mockPageStateHistory(partialPageStateHistory?: Partial<PageStateHistory>): PageStateHistory {
  const pageStateHistory: PageStateHistory = {
    addPageState: noop,
    stop: noop,
    findPageStatesForPeriod: () => [],
    wasInPageStateDuringPeriod: () => false,
    ...partialPageStateHistory,
  }

  return pageStateHistory
}
