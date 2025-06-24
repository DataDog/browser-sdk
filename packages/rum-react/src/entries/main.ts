/**
 * @packageDocumentation
 * Datadog Browser RUM React Integration - Additional components and hooks for React applications.
 * Provides React-specific features like Error Boundaries and component performance tracking.
 *
 * @see {@link https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/#react | RUM React Integration}
 */

export { ErrorBoundary, addReactError } from '../domain/error'
export { reactPlugin } from '../domain/reactPlugin'
// eslint-disable-next-line camelcase
export { UNSTABLE_ReactComponentTracker } from '../domain/performance'
