import { isEmptyObject } from '@datadog/browser-core'
import type { ContextManager } from '@datadog/browser-core'

// This is temporary. Logs and RUM functions are creating their own context manager, but in the
// future we should use the ones created in core. This function forwards all changes from one
// context manager to the other.
export function bindContextManager(inputContext: ContextManager, outputContext: ContextManager) {
  updateContext()
  inputContext.changeObservable.subscribe(updateContext)

  function updateContext() {
    const context = inputContext.getContext()
    if (!isEmptyObject(context)) {
      outputContext.setContext(context)
    } else {
      outputContext.clearContext()
    }
  }
}
