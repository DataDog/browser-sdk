// @datadog/browser-core-next
// v8 replacement for @datadog/browser-core
// Re-exports all @datadog/browser-core symbols for API parity during transition.
// New additions: Pipeline infrastructure (domain/pipeline), expanded session exports.

export * from '@datadog/browser-core'

export * from './domain/pipeline'
