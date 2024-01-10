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
