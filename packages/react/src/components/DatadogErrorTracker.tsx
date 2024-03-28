import React from 'react'
import type { ErrorInfo } from 'react'
import { DatadogContext } from '../lib/datadogContext'

// --------- Error Boundaries---------
interface DatadogErrorTrackerProps {
  children?: React.ReactNode
}

export class DatadogErrorTracker extends React.Component<DatadogErrorTrackerProps> {
  static contextType = DatadogContext

  constructor(props: DatadogErrorTrackerProps) {
    super(props)
  }

  static getDerivedStateFromError() {}

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
    // Forward the error to the error boundary above.
    throw error
  }

  render() {
    return this.props.children
  }
}
