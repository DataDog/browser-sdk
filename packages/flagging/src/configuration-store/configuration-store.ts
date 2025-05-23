import { Environment } from '../interfaces'

/**
 * ConfigurationStore interface
 */
export interface IConfigurationStore<T> {
  init(): Promise<void>
  get(key: string): T | null
  entries(): Record<string, T>
  getKeys(): string[]
  isInitialized(): boolean
  isExpired(): Promise<boolean>
  setEntries(entries: Record<string, T>): Promise<boolean>
  setEnvironment(environment: Environment): void
  getEnvironment(): Environment | null
  getConfigFetchedAt(): string | null
  setConfigFetchedAt(configFetchedAt: string): void
  getConfigPublishedAt(): string | null
  setConfigPublishedAt(configPublishedAt: string): void
  getFormat(): string | null
  setFormat(format: string): void
  salt?: string
}

export interface ISyncStore<T> {
  get(key: string): T | null
  entries(): Record<string, T>
  getKeys(): string[]
  isInitialized(): boolean
  setEntries(entries: Record<string, T>): void
}
