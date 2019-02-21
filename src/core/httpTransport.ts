import { Context } from "./context";

interface Message {
  message: string;
  severity?: string;
  [key: string]: any;
}

export class HttpTransport {
  constructor(private endpointUrl: string, private contextProvider: () => Context) {}

  send(message: Message) {
    const request = new XMLHttpRequest();
    request.open("POST", this.endpointUrl, true);
    request.send(this.computePayload(message));
  }

  private computePayload(message: Message) {
    return JSON.stringify({ ...message, ...this.contextProvider() });
  }
}
