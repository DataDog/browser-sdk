import { registerCleanupTask } from '../registerCleanupTask'

export function setPageVisibility(visibility: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    get() {
      return visibility
    },
    configurable: true,
  })
  registerCleanupTask(() => {
    delete (document as any).visibilityState
  })
}
