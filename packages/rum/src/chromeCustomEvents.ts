import { LifeCycle, LifeCycleEventType } from './lifeCycle'

const ROOT_TAG: HTMLCollection | null = document.getElementsByTagName('html')
const CUSTOM_EVENT_NAME = 'custom-rum-event'
const RUM_EVENT_NAME = 'DD_RUM.EVENT'

export function startSendingChromeCustomEvents(lifeCycle: LifeCycle) {
  function createCustomEvent(name: string, type: string, content: any) {
    const customEvent = new CustomEvent(name, {
      detail: {
        type,
        content: JSON.stringify(content),
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
      createCustomEvent(CUSTOM_EVENT_NAME, LifeCycleEventType[lifeCycleEventTypeValue as number], data)
    })
  }

  lifeCycle.subscribe(LifeCycleEventType.EVENT_HANDLED, (data) => {
    createCustomEvent(RUM_EVENT_NAME, data.event.evt.category, data)
  })
}
