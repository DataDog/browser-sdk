import { noop } from '@flashcatcloud/browser-core'
import type { PageStateHistory } from '../src/domain/contexts/pageStateHistory'

export function mockPageStateHistory(partialPageStateHistory?: Partial<PageStateHistory>): PageStateHistory {
  const pageStateHistory: PageStateHistory = {
    addPageState: noop,
    stop: noop,
    wasInPageStateDuringPeriod: () => false,
    ...partialPageStateHistory,
  }

  return pageStateHistory
}
