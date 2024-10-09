import { registerCleanupTask } from '../registerCleanupTask'

export function setPageVisibility(visibility: 'visible' | 'hidden') {
  registerCleanupTask(() => {
    delete (document as any).visibilityState
  })

  Object.defineProperty(document, 'visibilityState', {
    get() {
      return visibility
    },
    configurable: true,
  })
}
