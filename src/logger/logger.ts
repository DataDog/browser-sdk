import { HttpTransport } from "../core/httpTransport";

export class Logger {
  constructor(private logTransport: HttpTransport) {}

  log(message: string) {
    this.logTransport.send(message);
  }
}
