export class HttpTransport {
  constructor(private endpointUrl: string) {}

  send(data: any) {
    const request = new XMLHttpRequest();
    request.open("POST", this.endpointUrl, true);
    request.send(JSON.stringify(data));
  }
}
