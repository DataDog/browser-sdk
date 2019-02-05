declare global {
  interface Window {
    Datadog: Datadog;
  }
}

export interface Datadog {
  init(publicAPIKey: string): void;
  log?(message: string): void;
}
