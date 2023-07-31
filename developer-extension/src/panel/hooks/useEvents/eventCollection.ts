import { INTAKE_DOMAINS } from '../../../common/constants'
import { onBackgroundMessage } from '../../backgroundScriptConnection'
import type { SdkEvent } from '../../sdkEvent'

const MAXIMUM_LOGGED_EVENTS = 1000

export type EventCollectionStrategy = 'sdk' | 'requests'

export type EventCollection = ReturnType<typeof startEventCollection>

export function startEventCollection(strategy: EventCollectionStrategy, onEventsChanged: (events: SdkEvent[]) => void) {
  let events: SdkEvent[] = []

  const listenToEvents = strategy === 'requests' ? listenEventsFromRequests : listenEventsFromSdk
  const { stop } = listenToEvents((newEvents) => {
    events = [...newEvents, ...events]
      .sort((first: any, second: any) => second.date - first.date)
      .slice(0, MAXIMUM_LOGGED_EVENTS)
    onEventsChanged(events)
  })

  return {
    clear: () => {
      events = []
      onEventsChanged(events)
    },
    stop,
  }
}

function listenEventsFromRequests(callback: (events: SdkEvent[]) => void) {
  function beforeRequestHandler(request: chrome.devtools.network.Request) {
    const url = new URL(request.request.url)

    if (!INTAKE_DOMAINS.find((rootDomain) => url.hostname.endsWith(rootDomain))) {
      return
    }
    // intake request path is /api/vX/track
    if (!['rum', 'logs'].includes(url.pathname.split('/')[3])) {
      return
    }
    if (!request.request.postData || !request.request.postData.text) {
      return
    }

    const decodedBody = request.request.postData.text
    const rawEvents = decodedBody.split('\n')
    const events = rawEvents.map((rawEvent) => JSON.parse(rawEvent) as SdkEvent)

    callback(events)
  }

  chrome.devtools.network.onRequestFinished.addListener(beforeRequestHandler)

  return { stop: () => chrome.devtools.network.onRequestFinished.removeListener(beforeRequestHandler) }
}

function listenEventsFromSdk(events: (events: SdkEvent[]) => void) {
  const subscription = onBackgroundMessage.subscribe((backgroundMessage) => {
    if (backgroundMessage.type !== 'sdk-message') {
      return
    }
    const sdkMessage = backgroundMessage.message
    if (sdkMessage.type === 'logs' || sdkMessage.type === 'rum' || sdkMessage.type === 'telemetry') {
      events([sdkMessage.payload])
    }
  })
  return { stop: () => subscription.unsubscribe() }
}
