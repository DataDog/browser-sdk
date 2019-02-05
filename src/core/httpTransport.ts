export class HttpTransport {
  constructor(private endpointUrl: string) {}

  send(data: string) {
    const request = new XMLHttpRequest();
    request.open("POST", this.endpointUrl, true);
    request.send(data);
  }
}
