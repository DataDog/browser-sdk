import { Environment, FormatEnum } from '../interfaces';

import { IConfigurationStore, ISyncStore } from './configuration-store';

export class MemoryStore<T> implements ISyncStore<T> {
  private store: Record<string, T> = {};
  private initialized = false;

  get(key: string): T | null {
    return this.store[key] ?? null;
  }

  entries(): Record<string, T> {
    return this.store;
  }

  getKeys(): string[] {
    return Object.keys(this.store);
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  setEntries(entries: Record<string, T>): void {
    this.store = { ...entries };
    this.initialized = true;
  }
}

export class MemoryOnlyConfigurationStore<T> implements IConfigurationStore<T> {
  private readonly servingStore: ISyncStore<T> = new MemoryStore<T>();
  private initialized = false;
  private configFetchedAt: string | null = null;
  private configPublishedAt: string | null = null;
  private environment: Environment | null = null;
  private format: FormatEnum | null = null;
  salt?: string;

  init(): Promise<void> {
    this.initialized = true;
    return Promise.resolve();
  }

  get(key: string): T | null {
    return this.servingStore.get(key);
  }

  entries(): Record<string, T> {
    return this.servingStore.entries();
  }

  getKeys(): string[] {
    return this.servingStore.getKeys();
  }

  async isExpired(): Promise<boolean> {
    return true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async setEntries(entries: Record<string, T>): Promise<boolean> {
    this.servingStore.setEntries(entries);
    this.initialized = true;
    return true;
  }

  public getEnvironment(): Environment | null {
    return this.environment;
  }

  public setEnvironment(environment: Environment): void {
    this.environment = environment;
  }

  public getConfigFetchedAt(): string | null {
    return this.configFetchedAt;
  }

  public setConfigFetchedAt(configFetchedAt: string): void {
    this.configFetchedAt = configFetchedAt;
  }

  public getConfigPublishedAt(): string | null {
    return this.configPublishedAt;
  }

  public setConfigPublishedAt(configPublishedAt: string): void {
    this.configPublishedAt = configPublishedAt;
  }

  public getFormat(): FormatEnum | null {
    return this.format;
  }

  public setFormat(format: FormatEnum): void {
    this.format = format;
  }
}
