import { createRoot } from 'react-dom/client'
import { App } from './app'
export function mount(container: HTMLElement) {
  const root = createRoot(container)
  root.render(<App />)
  return () => root.unmount()
}
