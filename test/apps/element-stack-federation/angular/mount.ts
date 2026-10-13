import '@angular/compiler'
import { bootstrapApplication } from '@angular/platform-browser'
import { App } from './app'
export async function mount(container: HTMLElement) {
  container.appendChild(document.createElement('federated-angular'))
  const app = await bootstrapApplication(App)
  return () => app.destroy()
}
