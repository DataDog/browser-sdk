import { HttpTransport } from "../core/httpTransport";
import { monitored } from "../monitoring/monitoring";
import { LogLevel } from "./logLevel";

export class Logger {
  constructor(private transport: HttpTransport) {}

  @monitored
  log(message: string, context = {}, severity = LogLevel.INFO) {
    this.transport.send({ message, severity, ...context });
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
