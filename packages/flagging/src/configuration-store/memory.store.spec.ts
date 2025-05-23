import { MemoryOnlyConfigurationStore } from './memory.store';

describe('MemoryOnlyConfigurationStore', () => {
  let memoryStore: MemoryOnlyConfigurationStore<string>;

  beforeEach(() => {
    memoryStore = new MemoryOnlyConfigurationStore();
  });

  it('should initialize without any entries', () => {
    expect(memoryStore.isInitialized()).toBe(false);
    expect(memoryStore.getKeys()).toEqual([]);
  });

  it('is always expired', async () => {
    expect(await memoryStore.isExpired()).toBe(true);
  });

  it('should return null for non-existent keys', () => {
    expect(memoryStore.get('nonexistent')).toBeNull();
  });

  it('should allow setting and retrieving entries', async () => {
    await memoryStore.setEntries({ key1: 'value1', key2: 'value2' });
    expect(memoryStore.get('key1')).toBe('value1');
    expect(memoryStore.get('key2')).toBe('value2');
  });

  it('should report initialized after setting entries', async () => {
    await memoryStore.setEntries({ key1: 'value1' });
    expect(memoryStore.isInitialized()).toBe(true);
  });

  it('should return all keys', async () => {
    await memoryStore.setEntries({ key1: 'value1', key2: 'value2', key3: 'value3' });
    expect(memoryStore.getKeys()).toEqual(['key1', 'key2', 'key3']);
  });

  it('should return all entries', async () => {
    const entries = { key1: 'value1', key2: 'value2', key3: 'value3' };
    await memoryStore.setEntries(entries);
    expect(memoryStore.entries()).toEqual(entries);
  });

  it('should overwrite existing entries', async () => {
    await memoryStore.setEntries({ toBeReplaced: 'old value', toBeRemoved: 'delete me' });
    expect(memoryStore.get('toBeReplaced')).toBe('old value');
    expect(memoryStore.get('toBeRemoved')).toBe('delete me');
    expect(memoryStore.get('toBeAdded')).toBeNull();

    await memoryStore.setEntries({ toBeReplaced: 'new value', toBeAdded: 'add me' });
    expect(memoryStore.get('toBeReplaced')).toBe('new value');
    expect(memoryStore.get('toBeRemoved')).toBeNull();
    expect(memoryStore.get('toBeAdded')).toBe('add me');
  });
});
