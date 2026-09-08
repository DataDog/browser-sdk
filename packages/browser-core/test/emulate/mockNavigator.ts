import type { NetworkInformation } from '@datadog/js-core/util'
import { registerCleanupTask } from '../registerCleanupTask'

export function setNavigatorOnLine(onLine: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    get() {
      return onLine
    },
    configurable: true,
  })
  registerCleanupTask(() => {
    delete (navigator as any).onLine
  })
}

export function setNavigatorConnection(connection: Partial<NetworkInformation> | undefined) {
  Object.defineProperty(navigator, 'connection', {
    get() {
      return connection
    },
    configurable: true,
  })
  registerCleanupTask(() => {
    delete (navigator as any).connection
  })
}

export function setNavigatorDoNotTrack(doNotTrack: string | null | undefined) {
  const original = navigator.doNotTrack
  Object.defineProperty(navigator, 'doNotTrack', {
    get() {
      return doNotTrack
    },
    configurable: true,
  })
  registerCleanupTask(() => {
    Object.defineProperty(navigator, 'doNotTrack', {
      value: original,
      writable: true,
      configurable: true,
    })
  })
}
