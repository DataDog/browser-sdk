import type { Enricher } from './factory'

/**
 * Sorts enrichers topologically using Kahn's algorithm.
 *
 * Each enricher's `name` is its identity in the dependency graph.
 * The `requires` array references names of enrichers that must run first.
 * Enrichers without `requires` are treated as independent (no ordering constraints).
 * Independent enrichers are sorted alphabetically for deterministic output.
 *
 * @param enrichers - The enrichers to sort. Order of the input array does not matter.
 * @returns A new array with enrichers ordered so that each enricher's dependencies appear before it.
 * @example
 * ```ts
 * const sorted = topologicalSort([actionEnricher, viewEnricher, sessionEnricher])
 * // => [sessionEnricher, viewEnricher, actionEnricher]
 * // (session has no deps, view requires session, action requires view)
 * ```
 * @typeParam T - An {@link Enricher} subtype, preserved in the output array.
 * @throws If a `requires` entry references a name not found among the registered enrichers.
 * @throws If two enrichers share the same `name`.
 * @throws If a circular dependency is detected.
 */
function topologicalSort<T extends Enricher<any, any, any>>(enrichers: T[]): T[] {
  if (enrichers.length === 0) {
    return []
  }

  const nodeByName = new Map<string, T>()

  for (const enricher of enrichers) {
    if (nodeByName.has(enricher.name)) {
      throw new Error(`Duplicate enricher name: "${enricher.name}"`)
    }
    nodeByName.set(enricher.name, enricher)
  }

  const adjacency = new Map<string, Set<string>>()
  const inDegree = new Map<string, number>()

  for (const enricher of enrichers) {
    adjacency.set(enricher.name, new Set())
    inDegree.set(enricher.name, 0)
  }

  for (const enricher of enrichers) {
    for (const dependency of enricher.requires ?? []) {
      const requiredName = dependency.name
      if (!nodeByName.has(requiredName)) {
        throw new Error(
          `Enricher "${enricher.name}" requires "${requiredName}" but no enricher with that name exists. ` +
            `Registered enrichers: [${enrichers.map((e) => e.name).join(', ')}]`
        )
      }
      if (requiredName === enricher.name) {
        continue
      }
      if (!adjacency.get(requiredName)!.has(enricher.name)) {
        adjacency.get(requiredName)!.add(enricher.name)
        inDegree.set(enricher.name, inDegree.get(enricher.name)! + 1)
      }
    }
  }

  const queue: string[] = []
  for (const [name, degree] of inDegree) {
    if (degree === 0) {
      queue.push(name)
    }
  }
  queue.sort()

  const sorted: T[] = []

  while (queue.length > 0) {
    const current = queue.shift()!
    sorted.push(nodeByName.get(current)!)

    const newlyReady: string[] = []
    for (const neighbor of adjacency.get(current)!) {
      const newDegree = inDegree.get(neighbor)! - 1
      inDegree.set(neighbor, newDegree)
      if (newDegree === 0) {
        newlyReady.push(neighbor)
      }
    }
    newlyReady.sort()
    queue.push(...newlyReady)
  }

  if (sorted.length !== enrichers.length) {
    const sortedNames = new Set(sorted.map((e) => e.name))
    const remaining = enrichers.filter((e) => !sortedNames.has(e.name)).map((e) => e.name)
    throw new Error(`Cycle detected among enrichers: [${remaining.join(', ')}]`)
  }

  return sorted
}

export { topologicalSort }
