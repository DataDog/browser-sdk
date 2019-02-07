import { HttpTransport } from "../core/httpTransport";
import { LogLevel } from "./logLevel";

export class Logger {
  constructor(private logTransport: HttpTransport) {}

  log(message: string, context = {}, severity = LogLevel.INFO) {
    this.logTransport.send({ message, severity, ...context });
  }

  trace(message: string, context = {}) {
    this.log(message, context, LogLevel.TRACE);
  }

  debug(message: string, context = {}) {
    this.log(message, context, LogLevel.DEBUG);
  }

  info(message: string, context = {}) {
    this.log(message, context, LogLevel.INFO);
  }

  warn(message: string, context = {}) {
    this.log(message, context, LogLevel.WARN);
  }

  error(message: string, context = {}) {
    this.log(message, context, LogLevel.ERROR);
  }
}
