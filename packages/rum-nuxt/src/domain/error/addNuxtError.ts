import type { ComponentPublicInstance } from 'vue'
import { onRumStart } from '../nuxtPlugin'
import { reportNuxtError } from './setupNuxtErrorHandling'

export function addNuxtError(error: unknown, instance: ComponentPublicInstance | null, info: string) {
  onRumStart((addError) => {
    reportNuxtError(addError, error, instance, info)
  })
}
