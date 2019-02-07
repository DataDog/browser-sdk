declare global {
  interface Window {
    Datadog: Datadog;
  }
}

export interface Datadog {
  init(publicAPIKey: string): void;
  log(message: string): void;
}

/**
 * Avoid `TypeError: xxx is not a function`
 * if a method is not exposed
 */
export function initGlobal() {
  const global: any = {};
  ["init", "log"].forEach(method => {
    global[method] = () => console.log(`'${method}' not available`);
  });
  window.Datadog = global;
}
