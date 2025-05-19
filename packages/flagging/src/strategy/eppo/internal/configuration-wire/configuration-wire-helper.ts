import FetchHttpClient, {
  IHttpClient,
} from '../http-client';
import SdkTokenDecoder from '../sdk-token-decoder';

import { ConfigurationWireV1, IConfigurationWire } from './configuration-wire-types';
import ApiEndpoints from '../api-endpoints';

export type SdkOptions = {
  sdkName?: string;
  sdkVersion?: string;
  baseUrl?: string;
  fetchBandits?: boolean;
};

/**
 * Helper class for fetching and converting configuration from the Eppo API(s).
 */
export class ConfigurationWireHelper {
  private httpClient: IHttpClient;

  /**
   * Build a new ConfigurationHelper for the target SDK Key.
   * @param sdkKey
   * @param opts
   */
  public static build(
    sdkKey: string,
    opts: SdkOptions = { sdkName: 'js-client-sdk', sdkVersion: '4.0.0' },
  ) {
    const { sdkName, sdkVersion, baseUrl } = opts;
    return new ConfigurationWireHelper(sdkKey, sdkName, sdkVersion, baseUrl);
  }

  private constructor(
    sdkKey: string,
    targetSdkName = 'js-client-sdk',
    targetSdkVersion = '4.0.0',
    baseUrl?: string,
  ) {
    const queryParams = {
      sdkName: targetSdkName,
      sdkVersion: targetSdkVersion,
      apiKey: sdkKey,
      sdkProxy: 'config-wire-helper',
    };
    const apiEndpoints = new ApiEndpoints({
      baseUrl,
      queryParams,
      sdkTokenDecoder: new SdkTokenDecoder(sdkKey),
    });

    this.httpClient = new FetchHttpClient(apiEndpoints, 5000);
  }
}
