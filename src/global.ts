import { Context } from "./core/context";
import { LOG_LEVELS } from "./logger/logLevel";

declare global {
  interface Window {
    Datadog: Datadog;
  }
}

export interface Datadog {
  init(apiKey: string): void;
  log(message: string, context?: Context, severity?: string): void;
  trace(message: string, context?: Context): void;
  debug(message: string, context?: Context): void;
  info(message: string, context?: Context): void;
  warn(message: string, context?: Context): void;
  error(message: string, context?: Context): void;
  setGlobalContext(context: Context): void;
  addGlobalContext(key: string, value: any): void;
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
