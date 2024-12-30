import * as fs from 'fs'
import { inspect } from 'util'

const logsPath = undefined // (browser.options as WebdriverIO.Config & { logsPath: string }).logsPath
const stream: { write(s: string): void } = logsPath
  ? fs.createWriteStream(logsPath, { flags: 'a' })
  : { write: () => {} } // TODO: why do we need to log to stdout?

export function log(...args: any[]) {
  const prefix = `[${process.pid}] ${new Date().toISOString()}`
  stream.write(`${prefix}: ${formatArgs(args)}\n`)
}

function formatArgs(args: any[]) {
  return args.map((arg) => (typeof arg === 'string' ? arg : inspect(arg))).join(' ')
}
