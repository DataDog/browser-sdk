import React from 'react'
import type { ErrorInfo } from 'react'
import { addReactError } from './addReactError'

/**
 * React Error Boundary that captures uncaught errors thrown by its children
 * and reports them as RUM *Error* events.
 *
 * @public
 */
interface Props {
  /** React component rendered when an error is caught. */
  fallback: Fallback
  /** Elements to render inside the boundary. */
  children: React.ReactNode
}

/**
 * Signature of the fallback component rendered by {@link ErrorBoundary} when an
 * error occurs.
 *
 */
export type Fallback = React.ComponentType<{ error: Error; resetError: () => void }>

type State =
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
 * Error Boundary component used to capture runtime errors in the React tree
 * below and report them to Datadog RUM. It renders the `fallback` component
 * when an error is caught.
 *
 * @extends React.Component
 */
// eslint-disable-next-line no-restricted-syntax
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
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
