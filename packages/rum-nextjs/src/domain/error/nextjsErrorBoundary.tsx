'use client'

import { createErrorBoundary } from '@datadog/browser-rum-react/error-boundary'
import type {
  ErrorBoundaryFallback as ReactErrorBoundaryFallback,
  ErrorBoundaryProps as ReactErrorBoundaryProps,
} from '@datadog/browser-rum-react/error-boundary'
import { addNextjsError } from './addNextjsError'

export type NextjsErrorBoundaryProps = ReactErrorBoundaryProps

export type NextjsErrorBoundaryFallback = ReactErrorBoundaryFallback

export const NextjsErrorBoundary = createErrorBoundary(
  (error, errorInfo) => addNextjsError(error, errorInfo),
  'NextjsErrorBoundary'
)
