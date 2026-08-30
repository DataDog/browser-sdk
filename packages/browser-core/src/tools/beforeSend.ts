import type { Display } from '@datadog/js-core/util'
import { isIndexableObject } from '@datadog/js-core/util'
import { catchUserErrors } from './catchUserErrors'

export interface BeforeSendModification<T> {
  event: T
  apply: () => void
}

export type BeforeSendLimitModification<T> = (event: T) => BeforeSendModification<T> | undefined

export function runBeforeSend<T>(
  event: T,
  beforeSend: (event: T) => unknown,
  onResult: (result: unknown) => void,
  display: Display,
  limitModification?: BeforeSendLimitModification<T>
) {
  const modification = limitModification?.(event)
  const result = catchUserErrors(beforeSend, 'beforeSend threw an error:')(modification?.event ?? event)
  const promise = result as PromiseLike<unknown>

  if (isIndexableObject(result) && typeof promise.then === 'function') {
    promise.then(handleBeforeSendResult, (error) => {
      display.error('beforeSend threw an error:', error)
      handleBeforeSendResult(undefined)
    })
  } else {
    handleBeforeSendResult(result)
  }

  function handleBeforeSendResult(result: unknown) {
    modification?.apply()
    onResult(result)
  }
}
