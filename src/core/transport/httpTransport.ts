/**
 * Use POST request without content type to:
 * - avoid CORS preflight requests
 * - allow usage of sendBeacon
 *
 * multiple elements are sent separated by \n in order
 * to be parsed correctly without content type header
 */
export class HttpTransport {
  constructor(private endpointUrl: string) {}

  send(payload: object | string[]) {
    const data = this.serialize(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(this.endpointUrl, data);
    } else {
      const request = new XMLHttpRequest();
      request.open("POST", this.endpointUrl, true);
      request.send(data);
    }
  }

  private serialize(payload: object | string[]) {
    if (!Array.isArray(payload)) {
      return JSON.stringify(payload);
    }
    return payload.join("\n");
  }
}
