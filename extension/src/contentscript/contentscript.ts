import { LifeCycleEventType, View } from '../lib/rumEvents'

const ROOT_TAG: HTMLCollection | null = document.getElementsByTagName('html')
const CUSTOM_EVENT_NAME = 'custom-rum-event'

console.log('Waiting RUM events on:', ROOT_TAG, 'CUSTOM_EVENT_NAME:', CUSTOM_EVENT_NAME)

interface CustomeEventDetail {
  content: any
  date: number
  type: LifeCycleEventType
}

if (ROOT_TAG && ROOT_TAG.length) {
  ROOT_TAG[0].addEventListener(CUSTOM_EVENT_NAME, (customEvent: CustomEvent<CustomeEventDetail>) => {
    console.log('Received customEvent:', customEvent.detail)
    if (customEvent.detail) {
      console.log('Received type:', LifeCycleEventType[customEvent.detail.type])
    }

    if (
      customEvent.detail &&
      (String(customEvent.detail.type) === String(LifeCycleEventType.VIEW_CREATED) ||
        String(customEvent.detail.type) === String(LifeCycleEventType.VIEW_UPDATED))
    ) {
      const view: View = customEvent.detail.content as View
      console.log(
        'Received View: type: "' & customEvent.detail.type & '"',
        LifeCycleEventType[customEvent.detail.type],
        view
      )
    }
  })
}
