import { createMemoryStore } from './memoryStore'

describe('MemoryOnlyConfigurationStore', () => {
  let memoryStore: ReturnType<typeof createMemoryStore<string>>

  beforeEach(() => {
    memoryStore = createMemoryStore()
  })

  it('should initialize without any entries', () => {
    expect(memoryStore.isInitialized()).toBe(false)
    expect(memoryStore.getKeys()).toEqual([])
  })

  it('should return null for non-existent keys', () => {
    expect(memoryStore.get('nonexistent')).toBeNull()
  })

  it('should allow setting and retrieving entries', () => {
    memoryStore.setEntries({ key1: 'value1', key2: 'value2' })
    expect(memoryStore.get('key1')).toBe('value1')
    expect(memoryStore.get('key2')).toBe('value2')
  })

  it('should report initialized after setting entries', () => {
    memoryStore.setEntries({ key1: 'value1' })
    expect(memoryStore.isInitialized()).toBe(true)
  })

  it('should return all keys', () => {
    memoryStore.setEntries({ key1: 'value1', key2: 'value2', key3: 'value3' })
    expect(memoryStore.getKeys()).toEqual(['key1', 'key2', 'key3'])
  })

  it('should return all entries', () => {
    const entries = { key1: 'value1', key2: 'value2', key3: 'value3' }
    memoryStore.setEntries(entries)
    expect(memoryStore.entries()).toEqual(entries)
  })

  it('should overwrite existing entries', () => {
    memoryStore.setEntries({ toBeReplaced: 'old value', toBeRemoved: 'delete me' })
    expect(memoryStore.get('toBeReplaced')).toBe('old value')
    expect(memoryStore.get('toBeRemoved')).toBe('delete me')
    expect(memoryStore.get('toBeAdded')).toBeNull()

    memoryStore.setEntries({ toBeReplaced: 'new value', toBeAdded: 'add me' })
    expect(memoryStore.get('toBeReplaced')).toBe('new value')
    expect(memoryStore.get('toBeRemoved')).toBeNull()
    expect(memoryStore.get('toBeAdded')).toBe('add me')
  })
})
