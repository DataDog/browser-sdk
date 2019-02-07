export enum LogLevel {
  TRACE = "trace",
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error"
}

export const LOG_LEVELS = Object.keys(LogLevel).map(key => LogLevel[key as keyof typeof LogLevel]);
