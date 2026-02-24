import * as fs from 'node:fs'
import * as path from 'node:path'
import { printLog } from '../../lib/executionUtils.ts'

const DEV_SERVER_DIR = path.resolve('.dev-server')
export const LOG_FILE = path.join(DEV_SERVER_DIR, 'logs')
export const INTAKE_REQUESTS_FILE = path.join(DEV_SERVER_DIR, 'intake-requests.json')
const STATE_FILE = path.join(DEV_SERVER_DIR, 'state.json')

export interface DevServerState {
  pid: number
  port: number
  url: string
}

export function readState(): DevServerState | null {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as DevServerState
  } catch {
    return null
  }
}

export function writeState(state: DevServerState): void {
  fs.mkdirSync(DEV_SERVER_DIR, { recursive: true })
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

export function clearState(): void {
  try {
    fs.unlinkSync(STATE_FILE)
  } catch {
    // ignore
  }
}

export function printStatus(state: DevServerState): void {
  printLog(`\
Dev server is running at ${state.url}
Process id: ${state.pid}
Logs: ./${path.relative(process.cwd(), LOG_FILE)}
Intake requests: ./${path.relative(process.cwd(), INTAKE_REQUESTS_FILE)}`)
}

export function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
