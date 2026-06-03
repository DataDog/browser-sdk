import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { noop } from '@datadog/browser-core'
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
