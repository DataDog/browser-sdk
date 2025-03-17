import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { noop } from '@flashcatcloud/browser-core'
import { appendElement } from '../../rum-core/test'
import { registerCleanupTask } from '../../core/test'

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
