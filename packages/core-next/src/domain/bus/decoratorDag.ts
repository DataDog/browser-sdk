import type { DecoratorFactory } from './types'

/**
 * Resolves the execution order of decorators using topological sort (Kahn's algorithm).
 *
 * Each decorator declares what context keys it `provides` and `requires`.
 * The DAG ensures that a decorator only runs after all decorators providing its
 * required keys have already run.
 *
 * Throws if:
 * - A required key is not provided by any registered decorator
 * - A cycle is detected among the decorators
 */
export function resolveDecoratorOrder<TParams, TAttributes>(
  factories: Array<DecoratorFactory<TParams, TAttributes>>
): Array<DecoratorFactory<TParams, TAttributes>> {
  if (factories.length === 0) {
    return []
  }

  // Build a map of provided key → factory name(s)
  const providerMap = new Map<string, string[]>()
  const factoryByName = new Map<string, DecoratorFactory<TParams, TAttributes>>()

  for (const factory of factories) {
    if (factoryByName.has(factory.name)) {
      throw new Error(`Duplicate decorator name: "${factory.name}"`)
    }
    factoryByName.set(factory.name, factory)

    for (const key of factory.provides) {
      if (!providerMap.has(key)) {
        providerMap.set(key, [])
      }
      providerMap.get(key)!.push(factory.name)
    }
  }

  // Build adjacency list: for each factory, which factories must run before it
  // inDegree[name] = number of predecessors still unprocessed
  const adjacency = new Map<string, Set<string>>()
  const inDegree = new Map<string, number>()

  for (const factory of factories) {
    adjacency.set(factory.name, new Set())
    inDegree.set(factory.name, 0)
  }

  for (const factory of factories) {
    for (const requiredKey of factory.requires) {
      const providers = providerMap.get(requiredKey)
      if (!providers || providers.length === 0) {
        throw new Error(
          `Decorator "${factory.name}" requires key "${requiredKey}" but no decorator provides it. ` +
            `Registered decorators: [${factories.map((f) => f.name).join(', ')}]`
        )
      }

      for (const providerName of providers) {
        // Skip self-dependency
        if (providerName === factory.name) {
          continue
        }

        // Add edge: provider → factory (provider must run before factory)
        if (!adjacency.get(providerName)!.has(factory.name)) {
          adjacency.get(providerName)!.add(factory.name)
          inDegree.set(factory.name, inDegree.get(factory.name)! + 1)
        }
      }
    }
  }

  // Kahn's algorithm: BFS from nodes with in-degree 0
  const queue: string[] = []
  for (const [name, degree] of inDegree) {
    if (degree === 0) {
      queue.push(name)
    }
  }

  const sorted: Array<DecoratorFactory<TParams, TAttributes>> = []

  while (queue.length > 0) {
    // Sort the queue for deterministic ordering among same-depth nodes
    queue.sort()
    const current = queue.shift()!
    sorted.push(factoryByName.get(current)!)

    for (const neighbor of adjacency.get(current)!) {
      const newDegree = inDegree.get(neighbor)! - 1
      inDegree.set(neighbor, newDegree)
      if (newDegree === 0) {
        queue.push(neighbor)
      }
    }
  }

  if (sorted.length !== factories.length) {
    // Cycle detected — find the involved decorators
    const remaining = factories.filter((f) => !sorted.includes(f)).map((f) => f.name)
    throw new Error(`Cycle detected among decorators: [${remaining.join(', ')}]`)
  }

  return sorted
}
