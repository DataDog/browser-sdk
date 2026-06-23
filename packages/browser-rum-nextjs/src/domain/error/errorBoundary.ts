'use client'
import { createErrorBoundary } from '@openobserve/browser-rum-react/internal'
export type { ErrorBoundaryFallback, ErrorBoundaryProps } from '@openobserve/browser-rum-react/internal'
import { addNextjsError } from './addNextjsError'

/**
 * ErrorBoundary component to report React errors to Datadog using the Next.js error context.
 *
 * For more advanced error handling, you can use the {@link addNextjsError} function.
 *
 * @category Error
 * @example
 * ```ts
 * import { ErrorBoundary } from '@openobserve/browser-rum-nextjs'
 *
 * <ErrorBoundary fallback={() => null}>
 *   <Component />
 * </ErrorBoundary>
 * ```
 */
// eslint-disable-next-line local-rules/disallow-side-effects
export const ErrorBoundary = createErrorBoundary(addNextjsError)
