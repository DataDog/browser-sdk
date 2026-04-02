const SKIP = Symbol('skip')
const DISCARD = Symbol('discard')

type MaybePromise<T> = T | Promise<T>

type OutputOf<E extends { transform: (...args: any[]) => any }> = Exclude<
  Awaited<ReturnType<E['transform']>>,
  typeof SKIP | typeof DISCARD
>

type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (x: infer I) => void ? I : never

type AnyEnricher = Enricher<any, any, any>

type TransformFunction<TInput, TOutput> = (data: TInput) => MaybePromise<TOutput | typeof SKIP | typeof DISCARD>

type EnricherInput<TInput, TDeps extends readonly AnyEnricher[]> = [TDeps[number]] extends [never]
  ? TInput
  : TInput & UnionToIntersection<OutputOf<TDeps[number]>>

/**
 * A named data transformer that can be composed into a chain.
 *
 * Enrichers declare ordering constraints via `requires`, which holds references to other
 * enricher instances. The enricher's `name` is extracted at sort time to build the dependency graph.
 *
 * Use the {@link enricher} factory function to create enrichers with automatic type inference
 * from dependencies instead of manually annotating `TInput` and `TOutput`.
 *
 * @typeParam TInput - The base data shape before dependency outputs are merged.
 * @typeParam TOutput - The data shape this enricher produces. Defaults to `TInput` (pass-through).
 * @typeParam TDeps - Tuple of dependency enrichers. Their outputs are merged into the transform input.
 */
interface Enricher<TInput = unknown, TOutput = TInput, TDeps extends readonly AnyEnricher[] = []> {
  /** Unique identifier. Used by the dependency graph to resolve ordering. */
  name: string

  /**
   * Enricher instances that must run before this one.
   * Used by {@link topologicalSort} and {@link chain} to determine execution order.
   */
  requires?: TDeps

  /**
   * Transforms the input data. Return the enriched data, `SKIP` to pass through,
   * or `DISCARD` to drop the event entirely.
   * Can be synchronous or asynchronous.
   */
  transform: TransformFunction<EnricherInput<TInput, TDeps>, TOutput>
}

/**
 * Creates a type-safe {@link Enricher} with automatic type inference from dependencies.
 *
 * Instead of manually annotating `TInput` and `TOutput`, pass dependency enrichers
 * in `requires` and the input type is inferred as the intersection of their outputs.
 * The output type is inferred from what `transform` returns.
 *
 * @example
 * ```ts
 * // No dependencies — annotate the base type on transform's parameter
 * const session = enricher({
 *   name: 'session',
 *   transform: (data: RawEvent) => ({ ...data, sessionId: 'abc' }),
 * })
 * // With dependencies — input type is inferred from session's output
 * const view = enricher({
 *   name: 'view',
 *   requires: [session],
 *   transform: (data) => {
 *     data.sessionId // string — typed automatically
 *     return { ...data, viewId: 'view-1' }
 *   },
 * })
 * ```
 */
function enricher<Deps extends AnyEnricher[], TOutput>(config: {
  name: string
  requires: [...Deps]
  transform: TransformFunction<UnionToIntersection<OutputOf<Deps[number]>>, TOutput>
}): Enricher<UnionToIntersection<OutputOf<Deps[number]>>, TOutput, Deps>

function enricher<TInput, TOutput>(config: {
  name: string
  transform: TransformFunction<TInput, TOutput>
}): Enricher<TInput, TOutput>

function enricher(config: { name: string; requires?: AnyEnricher[]; transform: (data: any) => any }): AnyEnricher {
  return {
    name: config.name,
    requires: config.requires,
    transform: config.transform,
  }
}

export type { Enricher, AnyEnricher, EnricherInput, MaybePromise, TransformFunction, OutputOf, UnionToIntersection }
export { SKIP, DISCARD, enricher }
