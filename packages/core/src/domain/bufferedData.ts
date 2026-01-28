import { BufferedObservable } from '../tools/observable'
import { mockable } from '../tools/mockable'
import type { RawError } from './error/error.types'
import { trackRuntimeError } from './error/trackRuntimeError'

const BUFFER_LIMIT = 500

export const enum BufferedDataType {
  RUNTIME_ERROR,
}

export interface BufferedData {
  type: BufferedDataType.RUNTIME_ERROR
  error: RawError
}

export function startBufferingData() {
  const observable = new BufferedObservable<BufferedData>(BUFFER_LIMIT)

  const runtimeErrorSubscription = mockable(trackRuntimeError)().subscribe((error) => {
    observable.notify({
      type: BufferedDataType.RUNTIME_ERROR,
      error,
    })
  })

  return {
    observable,
    stop: () => {
      runtimeErrorSubscription.unsubscribe()
    },
  }
}
