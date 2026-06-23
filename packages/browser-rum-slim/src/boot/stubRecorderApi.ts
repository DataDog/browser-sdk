import { noop } from '@openobserve/browser-core'
import type { LifeCycle, RumConfiguration } from '@openobserve/browser-rum-core'
import { getSessionReplayLink } from '../domain/getSessionReplayLink'

export function makeRecorderApiStub() {
  let getSessionReplayLinkStrategy = noop as () => string | undefined
  return {
    start: noop,
    stop: noop,
    onRumStart(_lifeCycle: LifeCycle, configuration: RumConfiguration) {
      getSessionReplayLinkStrategy = () => getSessionReplayLink(configuration)
    },
    isRecording: () => false,
    getReplayStats: () => undefined,
    getSessionReplayLink: () => getSessionReplayLinkStrategy(),
  }
}
