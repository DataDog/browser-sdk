'use client'

import React from 'react'
import { addNextjsError } from './addNextjsError'

export interface NextjsErrorBoundaryProps {
  fallback: NextjsErrorBoundaryFallback
  children: React.ReactNode
}

export type NextjsErrorBoundaryFallback = React.ComponentType<{ error: Error; resetError: () => void }>

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

export class NextjsErrorBoundary extends React.Component<NextjsErrorBoundaryProps, State> {
  constructor(props: NextjsErrorBoundaryProps) {
    super(props)
    this.state = INITIAL_STATE
  }

  static getDerivedStateFromError(error: Error): State {
    return { didCatch: true, error }
  }

  resetError = () => {
    this.setState(INITIAL_STATE)
  }

  componentDidCatch(error: Error) {
    addNextjsError(error)
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
