import { noop } from '@datadog/js-core/util'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { appendElement } from '../../browser-rum-core/test'
import { registerCleanupTask } from '../../browser-core/test'

export function appendComponent(component: React.ReactNode) {
  const container = appendElement('<div></div>')
  const root = createRoot(container, {
    // Do nothing by default when an error occurs
    onRecoverableError: noop,
  })
  act(() => {
    root.render(component)
  })
  registerCleanupTask(() => {
    act(() => {
      root.unmount()
    })
  })
  return container
}
