import { LifeCycle, LifeCycleEventType, Subscription } from './lifeCycle'

const ROOT_TAG: HTMLCollection | null = document.getElementsByTagName('html')
const CUSTOM_EVENT_NAME = 'custom-rum-event'

export function startSendingChromeCustomEvents(lifeCycle: LifeCycle) {
  const subscriptions: Subscription[] = []

  function createCustomEvent(lifeCycleEventType: string, content: any) {
    const customEvent = new CustomEvent(CUSTOM_EVENT_NAME, {
      detail: {
        content,
        date: performance.now(),
        type: lifeCycleEventType,
      },
    })

    console.log('createCustomEvent:', {
      content,
      date: performance.now(),
      type: lifeCycleEventType,
    })

    if (ROOT_TAG && ROOT_TAG.length) {
      ROOT_TAG[0].dispatchEvent(customEvent)
    }
  }

  for (const lifeCycleEventTypeValue in Object.values(LifeCycleEventType)) {
    if (lifeCycleEventTypeValue) {
      lifeCycle.subscribe((lifeCycleEventTypeValue as any) as number, (data?: any) => {
        createCustomEvent(lifeCycleEventTypeValue, data)
      })
    }
  }

  return {
    stop() {
      subscriptions.forEach((s) => s.unsubscribe())
    },
  }
}
