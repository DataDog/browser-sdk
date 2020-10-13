import * as fs from 'fs'
import { inspect } from 'util'

const logsPath = (browser.config as WebdriverIO.Config & { logsPath: string }).logsPath
const stream = logsPath ? fs.createWriteStream(logsPath, { flags: 'a' }) : process.stdout

export function log(...args: any[]) {
  const prefix = `[${process.pid}] ${new Date().toISOString()}`
  stream.write(`${prefix}: ${formatArgs(args)}\n`)
}

function formatArgs(args: any[]) {
  return args.map((arg) => (typeof arg === 'string' ? arg : inspect(arg))).join(' ')
}
