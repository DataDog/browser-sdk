import { LifeCycle, LifeCycleEventType, Subscription } from './lifeCycle'

const rootTag: HTMLElement | null = document.getElementById('body')

export function startSendingChromeCustomEvents(lifeCycle: LifeCycle) {
  const subscriptions: Subscription[] = []

  function createCustomEvent(lifeCycleEventType: string, content: any) {
    const customEvent = new CustomEvent('custom-rum-event', {
      detail: {
        content,
        date: performance.now(),
        type: lifeCycleEventType,
      },
    })

    if (rootTag) {
      rootTag.dispatchEvent(customEvent)
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
