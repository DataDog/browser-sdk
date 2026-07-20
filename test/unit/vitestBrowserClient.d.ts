declare module '@vitest/browser/client' {
  export const client: {
    waitForConnection(): Promise<void>
    rpc: {
      getCountOfFailedTests(): Promise<number>
    }
  }
}
