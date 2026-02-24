/**
 * Represents a node in a directed acyclic graph with named dependency edges.
 * Used to declare ordering constraints between components.
 */
export interface DagNode {
  readonly name: string
  readonly provides: readonly string[]
  readonly requires: readonly string[]
}

/**
 * Sorts nodes topologically using Kahn's algorithm.
 *
 * Each node declares what keys it `provides` and `requires`.
 * A node only appears in the output after all nodes providing its required keys.
 *
 * Throws if:
 * - A required key is not provided by any registered node
 * - A duplicate name is found
 * - A cycle is detected
 */
export function topologicalSort<T extends DagNode>(nodes: T[]): T[] {
  if (nodes.length === 0) {
    return []
  }

  const providerMap = new Map<string, string[]>()
  const nodeByName = new Map<string, T>()

  for (const node of nodes) {
    if (nodeByName.has(node.name)) {
      throw new Error(`Duplicate node name: "${node.name}"`)
    }
    nodeByName.set(node.name, node)

    for (const key of node.provides) {
      if (!providerMap.has(key)) {
        providerMap.set(key, [])
      }
      providerMap.get(key)!.push(node.name)
    }
  }

  const adjacency = new Map<string, Set<string>>()
  const inDegree = new Map<string, number>()

  for (const node of nodes) {
    adjacency.set(node.name, new Set())
    inDegree.set(node.name, 0)
  }

  for (const node of nodes) {
    for (const requiredKey of node.requires) {
      const providers = providerMap.get(requiredKey)
      if (!providers || providers.length === 0) {
        throw new Error(
          `Node "${node.name}" requires key "${requiredKey}" but no node provides it. ` +
            `Registered nodes: [${nodes.map((n) => n.name).join(', ')}]`
        )
      }
      for (const providerName of providers) {
        if (providerName === node.name) {
          continue
        }
        if (!adjacency.get(providerName)!.has(node.name)) {
          adjacency.get(providerName)!.add(node.name)
          inDegree.set(node.name, inDegree.get(node.name)! + 1)
        }
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

  if (sorted.length !== nodes.length) {
    const sortedNames = new Set(sorted.map((n) => n.name))
    const remaining = nodes.filter((n) => !sortedNames.has(n.name)).map((n) => n.name)
    throw new Error(`Cycle detected among nodes: [${remaining.join(', ')}]`)
  }

  return sorted
}
