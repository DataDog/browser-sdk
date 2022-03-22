import type { StoredEvent } from '../../common/types'
import { generateUUID } from '../../../../packages/core/src/tools/utils'
import { intakeUrlPatterns } from '../intakeUrlPatterns'
import { setLocalStore, store } from '../store'

const MAXIMUM_LOGGED_EVENTS = 50

const decoder = new TextDecoder('utf-8')
chrome.webRequest.onBeforeRequest.addListener(
  (info) => {
    if (!store.logEventsFromRequests) {
      return
    }
    if (info.tabId < 0) {
      console.log('Some intake request was made in a non-tab context... (service worker maybe?)')
      return
    }

    const url = new URL(info.url)

    const intake = /^\w*/.exec(url.hostname)?.[0]
    if (!intake) {
      return
    }
    if (!info.requestBody!.raw) {
      return
    }
    const newEvents: StoredEvent[] = []
    for (const rawBody of info.requestBody!.raw) {
      if (rawBody.bytes) {
        const decodedBody = decoder.decode(rawBody.bytes)
        for (const rawEvent of decodedBody.split('\n')) {
          const event = sortProperties(JSON.parse(rawEvent))
          newEvents.push(event as StoredEvent)
          void chrome.tabs.executeScript(info.tabId, {
            code: `console.info("Browser-SDK:", ${JSON.stringify(intake)}, ${JSON.stringify(event)});`,
          })
        }
      }
    }
    storeEvents(newEvents, info.tabId)
  },
  {
    urls: intakeUrlPatterns,
  },
  ['requestBody']
)

function storeEvents(newEvents: StoredEvent[], tabId: number) {
  const previousEvents = Object.prototype.hasOwnProperty.call(store.local, tabId) ? store.local[tabId].events : []
  // kraft an event id used as React key
  const identifiedEvents = newEvents.map<StoredEvent>((event) => ({ ...event, id: generateUUID() }))
  const events = [...identifiedEvents, ...previousEvents]
    .sort((first: any, second: any) => second.date - first.date)
    .slice(0, MAXIMUM_LOGGED_EVENTS)

  setLocalStore({ events }, tabId)
}

function sortProperties(event: unknown): unknown {
  if (Array.isArray(event)) {
    return event.map(sortProperties)
  }

  if (typeof event === 'object' && event !== null) {
    const names = Object.getOwnPropertyNames(event)
    names.sort()
    const result: { [key: string]: unknown } = {}
    names.forEach((name) => {
      result[name] = sortProperties((event as { [key: string]: unknown })[name])
    })
    return result
  }

  return event
}
