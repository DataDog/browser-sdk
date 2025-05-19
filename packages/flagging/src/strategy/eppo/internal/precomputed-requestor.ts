import { IConfigurationStore } from './configuration-store/configuration-store';
import { hydrateConfigurationStore } from './configuration-store/configuration-store-utils';
import { IHttpClient } from './http-client';
import {
  PrecomputedFlag,
  UNKNOWN_ENVIRONMENT_NAME,
} from './interfaces';
import { ContextAttributes, FlagKey } from './types';

// Requests AND stores precomputed flags, reuses the configuration store
export default class PrecomputedFlagRequestor {
  constructor(
    private readonly httpClient: IHttpClient,
    private readonly precomputedFlagStore: IConfigurationStore<PrecomputedFlag>,
    private readonly subjectKey: string,
    private readonly subjectAttributes: ContextAttributes,
  ) { }

  async fetchAndStorePrecomputedFlags(): Promise<void> {
    const precomputedResponse = await this.httpClient.getPrecomputedFlags({
      subject_key: this.subjectKey,
      subject_attributes: this.subjectAttributes,
    });

    if (!precomputedResponse) {
      return;
    }

    const promises: Promise<boolean>[] = [];
    promises.push(
      hydrateConfigurationStore(this.precomputedFlagStore, {
        entries: precomputedResponse.flags,
        environment: precomputedResponse.environment ?? { name: UNKNOWN_ENVIRONMENT_NAME },
        createdAt: precomputedResponse.createdAt,
        format: precomputedResponse.format,
        salt: precomputedResponse.salt,
      }),
    );
    await Promise.all(promises);
  }
}
