import type { ComponentPublicInstance } from 'vue'
import { onRumInit } from '../nuxtPlugin'
import { reportNuxtError } from './setupNuxtErrorHandling'

export function addNuxtError(error: unknown, instance: ComponentPublicInstance | null, info: string) {
  onRumInit((_rumPublicApi, internalApi) => {
    reportNuxtError(internalApi, error, instance, info)
  })
}
