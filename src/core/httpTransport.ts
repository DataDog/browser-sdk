export class HttpTransport {
  private payloadParametersProviders: Array<(...args: any) => any> = [commonParameters];

  constructor(private endpointUrl: string, ...payloadParametersProviders: Array<(...args: any) => any>) {
    this.payloadParametersProviders = this.payloadParametersProviders.concat(payloadParametersProviders);
  }

  send(data: any) {
    const request = new XMLHttpRequest();
    request.open("POST", this.endpointUrl, true);
    request.send(this.computePayload(data));
  }

  private computePayload(data: any) {
    const providersParameters = this.payloadParametersProviders
      .map(provider => provider())
      .reduce((a, b) => ({ ...a, ...b }), {});
    return JSON.stringify({ ...data, ...providersParameters });
  }
}

function commonParameters() {
  return {
    http: {
      url: window.location.href,
      useragent: navigator.userAgent
    }
  };
}
