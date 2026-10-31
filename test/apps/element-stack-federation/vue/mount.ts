import { createApp } from 'vue'
import { App } from './app'
export function mount(container: HTMLElement) {
  const app = createApp(App)
  app.mount(container)
  return () => app.unmount()
}
