interface Message {
  message: string;
  severity?: string;
  [key: string]: any;
}

export class HttpTransport {
  extraParameters = {};

  constructor(private endpointUrl: string) {}

  send(message: Message) {
    const request = new XMLHttpRequest();
    request.open("POST", this.endpointUrl, true);
    request.send(this.computePayload(message));
  }

  private computePayload(message: Message) {
    return JSON.stringify({ ...message, ...commonParameters(), ...this.extraParameters });
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
