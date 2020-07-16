import { LifeCycle, LifeCycleEventType } from './lifeCycle'

const ROOT_TAG: HTMLCollection | null = document.getElementsByTagName('html')
const CUSTOM_EVENT_NAME = 'custom-rum-event'

export function startSendingChromeCustomEvents(lifeCycle: LifeCycle) {
  function createCustomEvent(lifeCycleEventType: number, content: any) {
    const customEvent = new CustomEvent(CUSTOM_EVENT_NAME, {
      detail: {
        content: JSON.stringify(content),
        date: performance.now(),
        type: LifeCycleEventType[lifeCycleEventType],
      },
    })

    if (ROOT_TAG && ROOT_TAG.length) {
      ROOT_TAG[0].dispatchEvent(customEvent)
    }
  }

  const LifeCycleEventTypes = Object.values(LifeCycleEventType)
    .filter((e) => Number(e))
    .filter(
      (e) =>
        [
          LifeCycleEventType.DOM_MUTATED,
          LifeCycleEventType.RESOURCE_ADDED_TO_BATCH,
          LifeCycleEventType.BEFORE_UNLOAD,
        ].indexOf(e as any) === -1
    )
  for (const lifeCycleEventTypeValue of LifeCycleEventTypes) {
    lifeCycle.subscribe(lifeCycleEventTypeValue as number, (data?: any) => {
      createCustomEvent(lifeCycleEventTypeValue as number, data)
    })
  }
}
