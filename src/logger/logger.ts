import { HttpTransport } from "../core/httpTransport";
import { monitor } from "../monitoring/monitoring.module";
import { LogLevel } from "./logLevel";

export class Logger {
  constructor(private transport: HttpTransport) {}

  @monitor
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
