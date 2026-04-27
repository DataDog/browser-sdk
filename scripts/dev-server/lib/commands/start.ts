import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parseArgs } from 'node:util'
import { readState, writeState, isRunning, printStatus, LOG_FILE } from '../state.ts'
import { printLog } from '../../../lib/executionUtils.ts'

const DAEMON_SCRIPT = path.join(import.meta.dirname, '../daemon.ts')
const STARTUP_TIMEOUT_MS = 10_000

export async function start(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      help: { type: 'boolean', short: 'h' },
      'no-daemon': { type: 'boolean', default: false },
    },
  })

  if (values.help) {
    printLog(`Usage: yarn dev-server start [options]

Options:
  --no-daemon    Run in the foreground instead of as a background daemon
  -h, --help     Show this message`)
    return
  }

  if (values['no-daemon']) {
    const { runServer } = await import('../server.ts')
    runServer({ writeIntakeFile: false })
    return
  }

  const existingState = readState()
  if (existingState && isRunning(existingState.pid)) {
    printStatus(existingState)
    return
  }

  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true })
  const logFd = fs.openSync(LOG_FILE, 'w')
  const child = spawn(process.execPath, [...process.execArgv, DAEMON_SCRIPT], {
    detached: true,
    stdio: ['ignore', logFd, logFd, 'ipc'],
    cwd: process.cwd(),
    env: { ...process.env, FORCE_COLOR: '1' },
  })
  fs.closeSync(logFd)

  const signal = AbortSignal.timeout(STARTUP_TIMEOUT_MS)

  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      child.kill()
      reject(new Error(`Dev server did not start within ${STARTUP_TIMEOUT_MS / 1000}s`))
    }
    signal.addEventListener('abort', onAbort)

    child.on('message', (msg: { port: number }) => {
      signal.removeEventListener('abort', onAbort)
      const url = `http://localhost:${msg.port}`
      const state = { pid: child.pid!, port: msg.port, url }
      writeState(state)
      printStatus(state)
      child.disconnect()
      child.unref()
      resolve()
    })

    child.on('error', (err) => {
      signal.removeEventListener('abort', onAbort)
      reject(err)
    })

    child.on('exit', (code) => {
      signal.removeEventListener('abort', onAbort)
      reject(new Error(`Dev server process exited with code ${code}`))
    })
  })
}
