import React from 'react'
import type { ErrorInfo } from 'react'
import { addReactError } from './addReactError'

export interface ErrorBoundaryProps {
  fallback: ErrorBoundaryFallback
  children: React.ReactNode
}

export type ErrorBoundaryFallback = React.ComponentType<{ error: Error; resetError: () => void }>

export type State =
  | {
      didCatch: false
      error: null
    }
  | {
      didCatch: true
      error: Error
    }

const INITIAL_STATE: State = { didCatch: false, error: null }

/**
 * ErrorBoundary component to report React errors to Datadog.
 *
 * For more advanced error handling, you can use the {@link addReactError} function.
 *
 * @category Error
 * @example
 * ```ts
 * import { ErrorBoundary } from '@datadog/browser-rum-react'
 *
 * <ErrorBoundary fallback={() => null}>
 *   <Component />
 * </ErrorBoundary>
 * ```
 */
// eslint-disable-next-line no-restricted-syntax
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, State> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = INITIAL_STATE
  }

  static getDerivedStateFromError(error: Error): State {
    return { didCatch: true, error }
  }

  resetError = () => {
    this.setState(INITIAL_STATE)
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    addReactError(error, errorInfo)
  }

  render() {
    if (this.state.didCatch) {
      return React.createElement(this.props.fallback, {
        error: this.state.error,
        resetError: this.resetError,
      })
    }

    return this.props.children
  }
}
