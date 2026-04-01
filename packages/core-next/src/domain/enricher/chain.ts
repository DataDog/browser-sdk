import type { Enricher, TransformFunction } from './factory'
import { SKIP, DISCARD } from './factory'
import { topologicalSort } from './topologicalSort'

type OutputOf<E extends { transform: TransformFunction<any, any> }> = Exclude<
  Awaited<ReturnType<E['transform']>>,
  typeof SKIP | typeof DISCARD
>

type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (x: infer I) => void ? I : never

type ChainOutput<T, Es extends Enricher<any, any, any>[]> = T & UnionToIntersection<Partial<OutputOf<Es[number]>>>

/**
 * Creates a reusable processing function from a list of enrichers.
 *
 * At creation time, enrichers are {@link topologicalSort | topologically sorted} based on their
 * `requires` declarations. The returned function runs the sorted enrichers sequentially,
 * passing the output of each as input to the next.
 *
 * If any enricher returns `DISCARD`, processing stops and `null` is returned (the data is dropped).
 * If any enricher returns `SKIP`, it and its dependents are bypassed.
 *
 * @param enrichers - The enrichers to compose. Order does not matter — they are sorted by dependencies.
 * @returns An async function that processes data through the sorted enricher chain.
 * @example
 * ```ts
 * const process = chain([sessionEnricher, viewEnricher, consentEnricher])
 * const result = await process({ type: 'error', startTime: 123 })
 * // result is enriched with session, view data — or null if consent discarded it
 * ```
 * @typeParam T - The base input data type.
 * @typeParam Es - Tuple of enrichers (inferred from the array).
 */
function chain<T, Es extends Enricher<any, any, any>[]>(
  enrichers: [...Es]
): (data: T) => Promise<ChainOutput<T, Es> | null> {
  const sorted = topologicalSort(enrichers)

  return async (data: T): Promise<ChainOutput<T, Es> | null> => {
    let current: unknown = data
    const skipped = new Set<string>()

    for (const enricher of sorted) {
      if ((enricher.requires as readonly Enricher[] | undefined)?.some((dep) => skipped.has(dep.name))) {
        skipped.add(enricher.name)
        continue
      }

      const result = await enricher.transform(current)

      if (result === DISCARD) {
        return null
      }

      if (result === SKIP) {
        skipped.add(enricher.name)
        continue
      }

      current = result
    }

    return current as ChainOutput<T, Es>
  }
}

export { chain }
