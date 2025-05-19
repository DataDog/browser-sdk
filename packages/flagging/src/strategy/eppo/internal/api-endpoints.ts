import { BASE_URL, PRECOMPUTED_FLAGS_ENDPOINT } from './constants';
import { IQueryParams, IQueryParamsWithSubject } from './http-client';
import SdkTokenDecoder from './sdk-token-decoder';

/**
 * Parameters for configuring the API endpoints
 *
 * @param queryParams Query parameters to append to the configuration endpoints
 * @param baseUrl Custom base URL for configuration endpoints (optional)
 * @param defaultUrl Default base URL for configuration endpoints (defaults to BASE_URL)
 * @param sdkTokenDecoder SDK token decoder for subdomain and event hostname extraction
 */
interface IApiEndpointsParams {
  queryParams?: IQueryParams | IQueryParamsWithSubject;
  baseUrl?: string;
  defaultUrl: string;
  sdkTokenDecoder?: SdkTokenDecoder;
}

/**
 * Utility class for constructing Eppo API endpoint URLs.
 *
 * This class handles two distinct types of endpoints:
 * 1. Configuration endpoints (UFC, bandits, precomputed flags) - based on the effective base URL
 *    which considers baseUrl, subdomain from SDK token, and defaultUrl in that order.
 * 2. Event ingestion endpoint - either uses the default event domain with subdomain from SDK token
 *    or a full hostname from SDK token. This endpoint IGNORES the baseUrl and defaultUrl parameters.
 *
 * For event ingestion endpoints, consider using the static helper method:
 * `ApiEndpoints.createEventIngestionUrl(sdkKey)`
 */
export default class ApiEndpoints {
  private readonly sdkToken: SdkTokenDecoder | null;
  private readonly _effectiveBaseUrl: string;
  private readonly params: IApiEndpointsParams;

  constructor(params: Partial<IApiEndpointsParams>) {
    this.params = Object.assign({}, { defaultUrl: BASE_URL }, params);
    this.sdkToken = params.sdkTokenDecoder ?? null;
    this._effectiveBaseUrl = this.determineBaseUrl();
  }

  /**
   * Normalizes a URL by ensuring proper protocol and removing trailing slashes
   */
  private normalizeUrl(url: string, protocol = 'https://'): string {
    const protocolMatch = url.match(/^(https?:\/\/|\/\/)/i);

    if (protocolMatch) {
      return url;
    }
    return `${protocol}${url}`;
  }

  private joinUrlParts(...parts: string[]): string {
    return parts
      .map((part) => part.trim())
      .map((part, i) => {
        // For first part, remove trailing slash
        if (i === 0) return part.replace(/\/+$/, '');
        // For other parts, remove leading and trailing slashes
        return part.replace(/^\/+|\/+$/g, '');
      })
      .join('/');
  }

  /**
   * Determines the effective base URL for configuration endpoints based on:
   * 1. If baseUrl is provided, and it is not equal to the DEFAULT_BASE_URL, use it
   * 2. If the api key contains an encoded customer-specific subdomain, use it with DEFAULT_DOMAIN
   * 3. Otherwise, fall back to DEFAULT_BASE_URL
   *
   * @returns The effective base URL to use for configuration endpoints
   */
  private determineBaseUrl(): string {
    // If baseUrl is explicitly provided and different from default, use it
    if (this.params.baseUrl && this.params.baseUrl !== this.params.defaultUrl) {
      return this.normalizeUrl(this.params.baseUrl);
    }

    // If there's a valid SDK token with a subdomain, use it
    const subdomain = this.sdkToken?.getSubdomain();
    if (subdomain && this.sdkToken?.isValid()) {
      // Extract the domain part without protocol
      const defaultUrl = this.params.defaultUrl;
      const domainPart = defaultUrl.replace(/^(https?:\/\/|\/\/)/, '');
      return this.normalizeUrl(`${subdomain}.${domainPart}`);
    }

    // Fall back to default URL
    return this.normalizeUrl(this.params.defaultUrl);
  }

  private endpoint(resource: string): string {
    const url = this.joinUrlParts(this._effectiveBaseUrl, resource);

    const queryParams = this.params.queryParams;
    if (!queryParams) {
      return url;
    }

    const urlSearchParams = new URLSearchParams();
    Object.entries(queryParams).forEach(([key, value]) => urlSearchParams.append(key, value));

    return `${url}?${urlSearchParams}`;
  }


  /**
   * Returns the URL for the precomputed flags endpoint.
   * Uses the configuration base URL determined by baseUrl, subdomain, or default.
   *
   * @returns The full precomputed flags endpoint URL
   */
  precomputedFlagsEndpoint(): string {
    return this.endpoint(PRECOMPUTED_FLAGS_ENDPOINT);
  }
}
