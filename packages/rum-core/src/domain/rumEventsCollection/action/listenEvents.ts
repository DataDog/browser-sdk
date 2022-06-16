import { addEventListener, DOM_EVENT } from '@datadog/browser-core'

export type OnClickCallback = (clickEvent: MouseEvent & { target: Element }) => void

export function listenEvents({ onClick }: { onClick: OnClickCallback }) {
  const { stop: stopClickListener } = addEventListener(
    window,
    DOM_EVENT.CLICK,
    (clickEvent: MouseEvent) => {
      if (clickEvent.target instanceof Element) {
        onClick(clickEvent as MouseEvent & { target: Element })
      }
    },
    { capture: true }
  )

  return {
    stop: () => {
      stopClickListener()
    },
  }
}
