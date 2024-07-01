import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { noop } from '@datadog/browser-core'
import { appendElement } from '../../rum-core/test'
import { registerCleanupTask } from '../../core/test'

export function appendComponent(component: React.ReactNode) {
  const container = appendElement('<div></div>')
  const root = createRoot(container, {
    // Do nothing by default when an error occurs
    onRecoverableError: noop,
  })
  flushSync(() => {
    root.render(component)
  })
  registerCleanupTask(() => {
    root.unmount()
  })
  return container
}
