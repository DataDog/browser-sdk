import { intakeUrlPatterns } from '../intakeUrlPatterns'
import { store } from '../store'

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
    if (!info.requestBody.raw) {
      return
    }

    for (const rawBody of info.requestBody.raw) {
      if (rawBody.bytes) {
        const decodedBody = decoder.decode(rawBody.bytes)
        for (const rawEvent of decodedBody.split('\n')) {
          const event = sortProperties(JSON.parse(rawEvent))
          void chrome.tabs.executeScript(info.tabId, {
            code: `console.info("Browser-SDK:", ${JSON.stringify(intake)}, ${JSON.stringify(event)});`,
          })
        }
      }
    }
  },
  {
    urls: intakeUrlPatterns,
  },
  ['requestBody']
)

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
