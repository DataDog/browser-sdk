import { monitored } from "../monitoring/monitoring";
import { Batch } from "../transport/batch";
import { LogLevelEnum } from "./logger.module";

export class Logger {
  constructor(private batch: Batch) {}

  @monitored
  log(message: string, context = {}, severity = LogLevelEnum.info) {
    this.batch.add({ message, severity, ...context });
  }

  trace(message: string, context = {}) {
    this.log(message, context, LogLevelEnum.trace);
  }

  debug(message: string, context = {}) {
    this.log(message, context, LogLevelEnum.debug);
  }

  info(message: string, context = {}) {
    this.log(message, context, LogLevelEnum.info);
  }

  warn(message: string, context = {}) {
    this.log(message, context, LogLevelEnum.warn);
  }

  error(message: string, context = {}) {
    this.log(message, context, LogLevelEnum.error);
  }
}
