export interface ISyncStore<T> {
  get(key: string): T | null
  entries(): Record<string, T>
  getKeys(): string[]
  isInitialized(): boolean
  setEntries(entries: Record<string, T>): void
}
