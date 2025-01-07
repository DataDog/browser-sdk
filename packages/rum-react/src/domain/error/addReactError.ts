import type { ErrorInfo } from 'react'
import { onReactPluginInit } from '../reactPlugin'

export function addReactError(error: Error, info: ErrorInfo) {
  onReactPluginInit((_, rumPublicApi) => {
    const reporter = rumPublicApi.createReporter('@datadog/browser-rum-react', {
      handlingStack: info.componentStack ?? undefined,
    })
    reporter.addError(error, { framework: 'react' })
  })
}
