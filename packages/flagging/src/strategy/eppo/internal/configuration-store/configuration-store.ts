import { Environment } from '../interfaces';

/**
 * ConfigurationStore interface
 *
 * The interface guides implementation
 * of a policy for handling a mixture of async and sync storage.
 *
 * The goal is to support remote API responses to be written to the sync and async store,
 * while also supporting reading from the sync store to maintain public SDK APIs.
 *
 * Implementation is handled in upstream libraries to best support their use case, some ideas:
 *
 * - Javascript frontend:
 *   - SyncStore: backed by localStorage
 *   - AsyncStore: backed by IndexedDB or chrome.storage.local
 *
 * - NodeJS backend:
 *   - SyncStore: backed by LRU cache
 *   - AsyncStore: none
 *
 * The policy choices surrounding the use of one or more underlying storages are
 * implementation specific and handled upstream.
 */
export interface IConfigurationStore<T> {
  init(): Promise<void>;
  get(key: string): T | null;
  entries(): Record<string, T>;
  getKeys(): string[];
  isInitialized(): boolean;
  isExpired(): Promise<boolean>;
  setEntries(entries: Record<string, T>): Promise<boolean>;
  setEnvironment(environment: Environment): void;
  getEnvironment(): Environment | null;
  getConfigFetchedAt(): string | null;
  setConfigFetchedAt(configFetchedAt: string): void;
  getConfigPublishedAt(): string | null;
  setConfigPublishedAt(configPublishedAt: string): void;
  getFormat(): string | null;
  setFormat(format: string): void;
  salt?: string;
}

export interface ISyncStore<T> {
  get(key: string): T | null;
  entries(): Record<string, T>;
  getKeys(): string[];
  isInitialized(): boolean;
  setEntries(entries: Record<string, T>): void;
}

export interface IAsyncStore<T> {
  isInitialized(): boolean;
  isExpired(): Promise<boolean>;
  entries(): Promise<Record<string, T>>;
  setEntries(entries: Record<string, T>): Promise<void>;
}
