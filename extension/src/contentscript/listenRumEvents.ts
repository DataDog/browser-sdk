import { LifeCycleEventType, View } from '../lib/rumEvents'

const ROOT_TAG: HTMLCollection | null = document.getElementsByTagName('html')
const CUSTOM_EVENT_NAME = 'custom-rum-event'
const RUM_EVENT_NAME = 'DD_RUM.EVENT'

interface CustomEventDetail {
  content: string
  date: number
  type: string
}

// TODO remove me
if (ROOT_TAG && ROOT_TAG.length) {
  ROOT_TAG[0].addEventListener(CUSTOM_EVENT_NAME, (customEvent: CustomEvent<CustomEventDetail>) => {
    if (
      customEvent.detail &&
      (customEvent.detail.type === LifeCycleEventType[LifeCycleEventType.VIEW_CREATED] ||
        customEvent.detail.type === LifeCycleEventType[LifeCycleEventType.VIEW_UPDATED])
    ) {
      chrome.runtime.sendMessage({
        payload: JSON.parse(customEvent.detail.content) as View,
        type: 'addOrUpdateViews',
      })
    }
  })
}
if (ROOT_TAG && ROOT_TAG.length) {
  ROOT_TAG[0].addEventListener(RUM_EVENT_NAME, (customEvent: CustomEvent<CustomEventDetail>) => {
    if (customEvent.detail) {
      chrome.runtime.sendMessage({
        event: JSON.parse(customEvent.detail.content),
        type: 'eventReceived',
      })
    }
  })
}
