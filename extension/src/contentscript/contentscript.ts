import { LifeCycleEventType, View } from '../lib/rumEvents'

const ROOT_TAG: HTMLCollection | null = document.getElementsByTagName('html')
const CUSTOM_EVENT_NAME = 'custom-rum-event'

console.log('Waiting RUM events on:', ROOT_TAG, 'CUSTOM_EVENT_NAME:', CUSTOM_EVENT_NAME)

interface CustomeEventDetail {
  content: string
  date: number
  type: LifeCycleEventType
}

if (ROOT_TAG && ROOT_TAG.length) {
  ROOT_TAG[0].addEventListener(CUSTOM_EVENT_NAME, (customEvent: CustomEvent<CustomeEventDetail>) => {
    if (
      customEvent.detail &&
      (String(customEvent.detail.type) === String(LifeCycleEventType.VIEW_CREATED) ||
        String(customEvent.detail.type) === String(LifeCycleEventType.VIEW_UPDATED))
    ) {
      const view: View = JSON.parse(customEvent.detail.content) as View
      console.log('Received View:', LifeCycleEventType[customEvent.detail.type], view)
    }
  })
}
