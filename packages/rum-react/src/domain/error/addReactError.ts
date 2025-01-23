import type { ErrorInfo } from 'react'
import type { ErrorWithCause } from '@datadog/browser-core'
import { onReactPluginInit } from '../reactPlugin'

export function addReactError(error: Error, context: object | undefined, info: ErrorInfo) {
  const renderingError = new Error(error.message)
  renderingError.name = 'ReactRenderingError'
  renderingError.stack = info.componentStack ?? undefined
  ;(renderingError as ErrorWithCause).cause = error
  onReactPluginInit((_, rumPublicApi) => {
    rumPublicApi.addError(renderingError, Object.assign({}, { framework: 'react' }, context))
  })
}
