interface TracerConfig {
  service: string
  env?: string
  version?: string
  // Allow any additional options without strict typing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

interface Tracer {
  init(config: TracerConfig): void
  setUrl(url: string): void
  // Other tracer APIs exist on the real dd-trace object but are not
  // needed by the current Electron integration, so they are left
  // intentionally untyped.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

declare const tracer: Tracer

// eslint-disable-next-line import/no-default-export
export default tracer
