import React from 'react'
import type { ErrorInfo } from 'react'
import { DatadogContext } from '../lib/datadogContext'

// --------- Error Boundaries---------
interface DatadogErrorTrackerProps {
  children?: React.ReactNode
}

export class DatadogErrorTracker<P, S> extends React.Component<DatadogErrorTrackerProps & P, S> {
  static contextType = DatadogContext

  constructor(props: DatadogErrorTrackerProps & P) {
    super(props)
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const { datadogReactRum } = this.context as React.ContextType<typeof DatadogContext>
    const renderingError = new Error(error.message)
    renderingError.name = 'ReactRenderingError'
    renderingError.stack = info.componentStack ?? undefined
    if ('cause' in renderingError) {
      renderingError.cause = error
    }
    datadogReactRum?.addError(renderingError, {
      framework: 'react',
    })
  }
}
