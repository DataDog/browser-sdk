import React from 'react'
import type { ErrorInfo } from 'react'
import { addReactError } from './addReactError'

interface Props {
  fallback: Fallback
  children: React.ReactNode
  errorContext?: object
}

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
    addReactError(error, this.props.errorContext, errorInfo)
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
