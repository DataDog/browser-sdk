import {
  Environment,
  PrecomputedFlag,
} from '../interfaces';

import { IConfigurationStore } from './configuration-store';

export type Entry = PrecomputedFlag;

export async function hydrateConfigurationStore<T extends Entry>(
  configurationStore: IConfigurationStore<T> | null,
  response: {
    entries: Record<string, T>;
    environment: Environment;
    createdAt: string;
    format: string;
    salt?: string;
  },
): Promise<boolean> {
  if (configurationStore) {
    const didUpdate = await configurationStore.setEntries(response.entries);
    if (didUpdate) {
      configurationStore.setEnvironment(response.environment);
      configurationStore.setConfigFetchedAt(new Date().toISOString());
      configurationStore.setConfigPublishedAt(response.createdAt);
      configurationStore.setFormat(response.format);
      configurationStore.salt = response.salt;
    }
    return didUpdate;
  }
  return false;
}
