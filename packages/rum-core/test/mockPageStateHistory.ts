import type { Duration } from '@datadog/browser-core'
import { noop } from '@datadog/browser-core'
import type { PageStateHistory } from '../src/domain/contexts/pageStateHistory'

export function mockPageStateHistory(partialPageStateHistory?: Partial<PageStateHistory>): PageStateHistory {
  const pageStateHistory: PageStateHistory = {
    addPageState: noop,
    stop: noop,
    wasInPageStateDuringPeriod: () => false,
    getDurationInStateDuringPeriod: () => 0 as Duration,
    ...partialPageStateHistory,
  }

  return pageStateHistory
}
