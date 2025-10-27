import type { ErrorBoundaryProps, ErrorBoundaryFallback } from '../domain/error'

export { ErrorBoundary, addReactError } from '../domain/error'
export type { ErrorBoundaryFallback, ErrorBoundaryProps } from '../domain/error'
export type { ReactPluginConfiguration, ReactPlugin } from '../domain/reactPlugin'
export { reactPlugin } from '../domain/reactPlugin'
// eslint-disable-next-line camelcase
export { UNSTABLE_ReactComponentTracker } from '../domain/performance'

/**
 * @deprecated Use {@link ErrorBoundaryProps} instead.
 */
export type Props = ErrorBoundaryProps

/**
 * @deprecated Use {@link ErrorBoundaryFallback} instead.
 */
export type Fallback = ErrorBoundaryFallback
