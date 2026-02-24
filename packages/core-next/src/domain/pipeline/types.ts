import type { Subscription } from '@datadog/browser-core'

// ---------------------------------------------------------------------------
// Decorator: named processor in the decoration pipeline
// ---------------------------------------------------------------------------

/**
 * Factory for creating decorators.
 * TEvent: the input event (e.g. RUM's DecorateEvent)
 * TAttributes: the partial event attributes each decorator can contribute
 */
export interface DecoratorFactory<TEvent = unknown, TAttributes = unknown> {
  readonly name: string
  readonly provides: readonly string[]
  readonly requires: readonly string[]
  readonly capabilities: {
    readonly canDiscard: boolean
  }
  create(deps: DecoratorDeps): Decorator<TEvent, TAttributes>
}

export interface DecoratorDeps {
  [key: string]: unknown
}

export interface Decorator<TEvent = unknown, TAttributes = unknown> {
  /**
   * Decorates the given event.
   * @param event - The event being decorated.
   * @param accumulated - Attributes contributed by upstream decorators in this DAG pass (read-only snapshot).
   */
  decorate(event: TEvent, accumulated: Readonly<Partial<TAttributes>>): Promise<DecoratorResult<TAttributes>>
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
