/**
 * Pluggable transport interface for sending serialized event data to the intake.
 * Environments provide their own implementation (e.g. fetch + beacon in browser).
 */
interface Transport {
  /** Sends serialized data to the intake. Retry logic is internal to the implementation. */
  send(data: string): void

  /**
   * Drains any pending data immediately. Called by the environment on exit
   * (e.g. visibilitychange, beforeunload). Implementations that don't buffer
   * can provide a no-op.
   */
  flush(): void
}

export type { Transport }
