import { HttpTransport } from "../core/httpTransport";

export class Logger {
  constructor(private logTransport: HttpTransport) {}

  log(message: string, context = {}, severity = "info") {
    this.logTransport.send({ message, severity, ...context });
  }

  trace(message: string, context = {}) {
    this.log(message, context, "trace");
  }

  debug(message: string, context = {}) {
    this.log(message, context, "debug");
  }

  info(message: string, context = {}) {
    this.log(message, context, "info");
  }

  warn(message: string, context = {}) {
    this.log(message, context, "warn");
  }

  error(message: string, context = {}) {
    this.log(message, context, "error");
  }
}
