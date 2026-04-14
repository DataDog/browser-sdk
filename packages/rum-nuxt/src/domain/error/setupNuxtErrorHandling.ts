import type { ComponentPublicInstance, App } from 'vue'
import { addNuxtError } from './addNuxtError'

export interface NuxtApp {
  vueApp: App
  hook(name: 'app:error', callback: (err: unknown) => void): void
}

export function setupNuxtErrorHandling(nuxtApp: NuxtApp): void {
  const deduplicatedAddNuxtError = callOnce(addNuxtError)

  // Wrap existing errorHandler rather than replacing it, so Nuxt's own
  // handleVueError (which drives the error page) is still called.
  const original = nuxtApp.vueApp.config.errorHandler
  nuxtApp.vueApp.config.errorHandler = (error, instance, info) => {
    deduplicatedAddNuxtError(error, instance, info)
    original?.(error, instance, info)
  }

  nuxtApp.hook('app:error', (err) => {
    deduplicatedAddNuxtError(err, null, '')
  })
}

function callOnce(func: (error: unknown, instance: ComponentPublicInstance | null, info: string) => void) {
  const seen = new WeakSet<object>()
  return (error: unknown, instance: ComponentPublicInstance | null, info: string) => {
    if (error !== null && typeof error === 'object') {
      if (seen.has(error)) {
        return
      }
      seen.add(error)
    }
    func(error, instance, info)
  }
}
