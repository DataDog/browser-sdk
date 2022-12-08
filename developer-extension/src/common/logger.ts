const DEVELOPER_EXTENSION_PREFIX = 'Datadog Browser SDK extension:'

export function createLogger(module: string) {
  return {
    log(...args: any[]) {
      // eslint-disable-next-line no-console
      console.log(DEVELOPER_EXTENSION_PREFIX, `[${module}]`, ...args)
    },
    error(...args: any[]) {
      // eslint-disable-next-line no-console
      console.error(DEVELOPER_EXTENSION_PREFIX, `[${module}]`, ...args)
    },
  }
}
