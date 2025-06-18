import { BufferedObservable } from '../tools/observable'
import type { RawError } from './error/error.types'
import { trackRuntimeError } from './error/trackRuntimeError'

const BUFFER_LIMIT = 500

export const enum EarlyDataType {
  RUNTIME_ERROR,
}

export type EarlyData = {
  type: EarlyDataType.RUNTIME_ERROR
  error: RawError
}

export function startEarlyDataCollection(trackRuntimeErrorImpl = trackRuntimeError) {
  const observable = new BufferedObservable<EarlyData>(BUFFER_LIMIT)

  const runtimeErrorSubscription = trackRuntimeErrorImpl().subscribe((error) => {
    observable.notify({
      type: EarlyDataType.RUNTIME_ERROR,
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
