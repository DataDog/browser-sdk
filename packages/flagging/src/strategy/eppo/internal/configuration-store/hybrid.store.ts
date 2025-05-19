import { Environment, FormatEnum } from '../interfaces';

import { IAsyncStore, IConfigurationStore, ISyncStore } from './configuration-store';

export class HybridConfigurationStore<T> implements IConfigurationStore<T> {
  constructor(
    protected readonly servingStore: ISyncStore<T>,
    protected readonly persistentStore: IAsyncStore<T> | null,
  ) { }
  private environment: Environment | null = null;
  private configFetchedAt: string | null = null;
  private configPublishedAt: string | null = null;
  private format: FormatEnum | null = null;

  /**
   * Initialize the configuration store by loading the entries from the persistent store into the serving store.
   */
  async init(): Promise<void> {
    if (!this.persistentStore) {
      return;
    }

    if (!this.persistentStore.isInitialized()) {
      /**
       * The initial remote request to the remote API failed
       * or never happened because we are in the cool down period.
       *
       * Shows a log message that the assignments served from the serving store
       * may be stale.
       */
      console.warn(
        `Persistent store is not initialized from remote configuration. Serving assignments that may be stale.`,
      );
    }

    const entries = await this.persistentStore.entries();
    this.servingStore.setEntries(entries);
  }

  public isInitialized(): boolean {
    return this.servingStore.isInitialized() && (this.persistentStore?.isInitialized() ?? true);
  }

  public async isExpired(): Promise<boolean> {
    const isExpired = await this.persistentStore?.isExpired();
    return isExpired ?? true;
  }

  public get(key: string): T | null {
    if (!this.servingStore.isInitialized()) {
      console.warn(`getting a value from a ServingStore that is not initialized.`);
    }
    return this.servingStore.get(key);
  }

  public entries(): Record<string, T> {
    return this.servingStore.entries();
  }

  public getKeys(): string[] {
    return this.servingStore.getKeys();
  }

  public async setEntries(entries: Record<string, T>): Promise<boolean> {
    if (this.persistentStore) {
      // Persistence store is now initialized and should mark itself accordingly.
      await this.persistentStore.setEntries(entries);
    }
    this.servingStore.setEntries(entries);
    return true;
  }

  setEnvironment(environment: Environment): void {
    this.environment = environment;
  }

  getEnvironment(): Environment | null {
    return this.environment;
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
