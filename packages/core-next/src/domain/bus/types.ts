import type { Subscription } from '@datadog/browser-core'

// ---------------------------------------------------------------------------
// Decorator: named processor in the decoration pipeline
// ---------------------------------------------------------------------------

/**
 * Factory for creating decorators.
 * TParams: the input observation parameters (e.g. RUM's DecorateParams)
 * TAttributes: the partial event attributes each decorator can contribute
 */
export interface DecoratorFactory<TParams = unknown, TAttributes = unknown> {
  readonly name: string
  readonly provides: readonly string[]
  readonly requires: readonly string[]
  readonly capabilities: {
    readonly canDiscard: boolean
  }
  create(deps: DecoratorDeps): Decorator<TParams, TAttributes>
}

export interface DecoratorDeps {
  [key: string]: unknown
}

export interface Decorator<TParams = unknown, TAttributes = unknown> {
  decorate(params: TParams): DecoratorResult<TAttributes>
}

export type DecoratorResult<TAttributes = unknown> =
  | { status: 'contributed'; attributes: TAttributes }
  | { status: 'skipped' }
  | { status: 'discarded'; reason: string }

// ---------------------------------------------------------------------------
// Decoration Trace: built-in traceability for debugging
// ---------------------------------------------------------------------------

export interface DecorationTrace {
  observationId: string
  steps: DecorationStep[]
}

export interface DecorationStep {
  decorator: string
  status: 'contributed' | 'skipped' | 'discarded'
  attributes?: unknown
  durationMs: number
}

// ---------------------------------------------------------------------------
// Bus interface (generic)
// ---------------------------------------------------------------------------

export type BusUnsubscribe = Subscription
