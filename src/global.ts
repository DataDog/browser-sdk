import { LOG_LEVELS } from "./logger/logLevel";

declare global {
  interface Window {
    Datadog: Datadog;
  }
}

export interface Datadog {
  init(apiKey: string): void;
  log(message: string, context?: any, severity?: string): void;
  trace(message: string, context?: any): void;
  debug(message: string, context?: any): void;
  info(message: string, context?: any): void;
  warn(message: string, context?: any): void;
  error(message: string, context?: any): void;
  setGlobalContext(context: any): void;
}

/**
 * Avoid `TypeError: xxx is not a function`
 * if a method is not exposed
 */
export function initGlobal() {
  const global: any = {};
  ["init", "log", ...LOG_LEVELS, "setGlobalContext"].forEach(method => {
    global[method] = () => console.log(`'${method}' not available`);
  });
  window.Datadog = global;
}
