import type { RelativeTime, Subscription } from '@datadog/browser-core'
import { Observable } from '@datadog/browser-core'

export interface SalesforceResourcePollView {
  startRelativeTime: RelativeTime
}

export interface SalesforceResourcePollEntry {
  responseEnd?: number
}

export interface SalesforceResourcePoll {
  currentView: SalesforceResourcePollView | undefined
  resourceEntries: SalesforceResourcePollEntry[] | undefined
}

const salesforceResourcePollObservable = new Observable<SalesforceResourcePoll>()

export function notifySalesforceResourcePoll(poll: SalesforceResourcePoll) {
  salesforceResourcePollObservable.notify(poll)
}

export function subscribeToSalesforceResourcePoll(callback: (poll: SalesforceResourcePoll) => void): Subscription {
  return salesforceResourcePollObservable.subscribe(callback)
}
