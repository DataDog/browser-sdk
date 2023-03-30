import type { CiTestWindow } from '../src/domain/contexts/ciTestContext'

export function mockCiVisibilityWindowValues(traceId?: unknown) {
  if (traceId) {
    ;(window as CiTestWindow).Cypress = {
      env: (key: string) => {
        if (typeof traceId === 'string' && key === 'traceId') {
          return traceId
        }
      },
    }
  }
}

export function cleanupCiVisibilityWindowValues() {
  delete (window as CiTestWindow).Cypress
}
