/**
 * Use POST request without content type to
 * avoid CORS preflight requests
 *
 * multiple elements are sent separated by \n in order
 * to be pared correctly without content type header
 */
export class HttpTransport {
  constructor(private endpointUrl: string) {}

  send(payload: object | object[]) {
    const request = new XMLHttpRequest();
    request.open("POST", this.endpointUrl, true);
    request.send(this.serialize(payload));
  }

  private serialize(payload: object | object[]) {
    if (!Array.isArray(payload)) {
      return JSON.stringify(payload);
    }
    return payload.map(element => JSON.stringify(element)).join("\n");
  }
}
