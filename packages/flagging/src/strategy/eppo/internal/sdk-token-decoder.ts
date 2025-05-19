import { Base64 } from 'js-base64';

/**
 * Decodes SDK tokens with embedded encoded data.
 */
export default class SdkTokenDecoder {
  private readonly decodedParams: URLSearchParams | null;

  constructor(private readonly sdkKey: string) {
    try {
      const [, payload] = sdkKey.split('.');
      const encodedPayload = payload ?? null;
      this.decodedParams = encodedPayload
        ? new URLSearchParams(Base64.decode(encodedPayload))
        : null;
    } catch {
      this.decodedParams = null;
    }
  }

  private getDecodedValue(key: string): string | null {
    return this.decodedParams?.get(key) || null;
  }

  getEventIngestionHostname(): string | null {
    return this.getDecodedValue('eh');
  }

  getSubdomain(): string | null {
    return this.getDecodedValue('cs');
  }

  /**
   * Gets the raw SDK Key.
   */
  getToken(): string {
    return this.sdkKey;
  }

  /**
   * Checks if the SDK Key had the subdomain or event hostname encoded.
   */
  isValid(): boolean {
    if (!this.decodedParams) return false;
    return !!this.getEventIngestionHostname() || !!this.getSubdomain();
  }
}
