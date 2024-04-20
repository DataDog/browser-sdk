import { isRumEvent, SdkEvent } from '../sdkEvent'
import { useEffect, useRef, useState } from 'react'
import type { EventCollectionStrategy } from '../../common/types'
import { onBackgroundMessage } from '../backgroundScriptConnection'
import { INTAKE_DOMAINS } from '../../common/constants'
import { RumActionEvent } from '@datadog/browser-rum-core'

export type VulnerabilityCollection = ReturnType<typeof startVulnerabilityCollection>

export function useVulnerabilities({
  preserveEvents,
  eventCollectionStrategy,
}: {
  preserveEvents: boolean
  eventCollectionStrategy: EventCollectionStrategy
}) {
  const [vulnerabilities, setVulnerabilities] = useState<RumActionEvent[]>([])
  const vulnerabilityCollectionRef = useRef<VulnerabilityCollection>()

  function clearEvents() {
    vulnerabilityCollectionRef.current?.clear()
  }

  useEffect(() => {
    const vulnerabilityCollection = startVulnerabilityCollection(eventCollectionStrategy, setVulnerabilities)
    vulnerabilityCollectionRef.current = vulnerabilityCollection
    return () => vulnerabilityCollection.stop()
  }, [eventCollectionStrategy])

  useEffect(() => {
    if (!preserveEvents) {
      const clearCurrentEvents = (details: chrome.webNavigation.WebNavigationTransitionCallbackDetails) => {
        if (details.transitionType === 'reload' && details.tabId === chrome.devtools.inspectedWindow.tabId) {
          clearEvents()
        }
      }
      chrome.webNavigation.onCommitted.addListener(clearCurrentEvents)
      return () => {
        chrome.webNavigation.onCommitted.removeListener(clearCurrentEvents)
      }
    }
  }, [preserveEvents])
  


  return {
    clearVulnerabilities: clearEvents,
    vulnerabilities
  }
}

function startVulnerabilityCollection(strategy: EventCollectionStrategy, onEventsChanged: (events: RumActionEvent[]) => void) {
  let events: RumActionEvent[] = []

  const listenToEvents = strategy === 'requests' ? listenEventsFromRequests : listenEventsFromSdk
  const { stop } = listenToEvents((newEvents) => {
    // TODO remove events from facet registry when they are out of retention
    // @ts-ignore
    events = [...newEvents, ...events].filter((event: SdkEvent) => isRumEvent(event) && event?.action?.target?.name === 'vulnerability').slice(0, 100)
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
