import { registerCleanupTask } from '../registerCleanupTask'
import type { NetworkInformation } from '../../src'

export function setNavigatorOnLine(onLine: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get() {
      return onLine
    },
  })
  registerCleanupTask(() => {
    delete (navigator as any).onLine
  })
}

export function setNavigatorConnection(connection: NetworkInformation | undefined) {
  Object.defineProperty(navigator, 'connection', {
    configurable: true,
    get() {
      return connection
    },
  })
  registerCleanupTask(() => {
    delete (navigator as any).connection
  })
}
