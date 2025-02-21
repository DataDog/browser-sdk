/**
 * Map with limited capacity and least-recently used cache eviction strategy
 */
export function createLruCache<K, V>(maxEntries: number = 20) {
  const values: Map<K, V> = new Map<K, V>()

  function has(key: K): boolean {
    return values.has(key)
  }

  function get(key: K): V | undefined {
    let entry: V | undefined
    if (values.has(key)) {
      // peek the entry, re-insert for LRU strategy
      entry = values.get(key)!
      values.delete(key)
      values.set(key, entry)
    }

    return entry
  }

  function set(key: K, value: V): void {
    if (values.size >= maxEntries) {
      // least-recently used cache eviction strategy
      const keyToDelete = values.keys().next().value

      // TODO: keyToDelete can be undefined
      values.delete(keyToDelete!)
    }

    values.set(key, value)
  }

  function deleteKey(key: K): void {
    values.delete(key)
  }

  /**
   * Returns cache entry under the given key if exists, otherwise runs miss() function and stores the result.
   */
  function lookup(key: K, miss: (key: K) => V): V {
    if (values.has(key)) {
      return get(key)!
    }
    const value = miss(key)
    set(key, value)
    return value
  }

  function keys(): IterableIterator<K> {
    return values.keys()
  }

  function clear(): void {
    values.clear()
  }

  return {
    has,
    get,
    set,
    delete: deleteKey,
    lookup,
    keys,
    clear,
  }
}
