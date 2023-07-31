import { generateUUID } from '../../../../../packages/core/src/tools/utils/stringUtils'
import type { TelemetryEvent } from '../../../../../packages/core/src/domain/telemetry'
import type { LogsEvent } from '../../../../../packages/logs/src/logsEvent.types'
import type { RumEvent } from '../../../../../packages/rum-core/src/rumEvent.types'
import { INTAKE_DOMAINS } from '../../../common/constants'
import { onBackgroundMessage } from '../../backgroundScriptConnection'

const MAXIMUM_LOGGED_EVENTS = 1000

export type EventSource = 'sdk' | 'requests'

export type StoredEvent = (RumEvent | TelemetryEvent | LogsEvent) & {
  id: string
}

export type EventCollection = ReturnType<typeof startEventCollection>

export function startEventCollection(eventSource: EventSource, onEventsChanged: (events: StoredEvent[]) => void) {
  let events: StoredEvent[] = []

  const listenToEvents = eventSource === 'requests' ? listenEventsFromRequests : listenEventsFromSdk
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

function listenEventsFromRequests(callback: (events: StoredEvent[]) => void) {
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
    const events = rawEvents.map((rawEvent) => ({ ...JSON.parse(rawEvent), id: generateUUID() }) as StoredEvent)

    callback(events)
  }

  chrome.devtools.network.onRequestFinished.addListener(beforeRequestHandler)

  return { stop: () => chrome.devtools.network.onRequestFinished.removeListener(beforeRequestHandler) }
}

function listenEventsFromSdk(events: (events: StoredEvent[]) => void) {
  const subscription = onBackgroundMessage.subscribe((backgroundMessage) => {
    if (backgroundMessage.type !== 'sdk-message') {
      return
    }
    const sdkMessage = backgroundMessage.message
    if (sdkMessage.type === 'logs' || sdkMessage.type === 'rum' || sdkMessage.type === 'telemetry') {
      events([{ ...sdkMessage.payload, id: generateUUID() }])
    }
  })
  return { stop: () => subscription.unsubscribe() }
}
