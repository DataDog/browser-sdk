import * as fs from 'fs'
import * as path from 'path'
import { promisify } from 'util'

const readFile = promisify(fs.readFile)

const ROOT = path.join(__dirname, '../../../..')
const RUM_BUNDLE = path.join(ROOT, 'packages/rum/bundle/datadog-rum.js')
const RUM_SLIM_BUNDLE = path.join(ROOT, 'packages/rum-slim/bundle/datadog-rum-slim.js')
const LOGS_BUNDLE = path.join(ROOT, 'packages/logs/bundle/datadog-logs.js')
const RUM_RECORDER_BUNDLE = path.join(ROOT, 'packages/rum-recorder/bundle/datadog-rum-recorder.js')
const NPM_BUNDLE = path.join(ROOT, 'test/app/dist/app.js')

export interface Endpoints {
  rum: string
  logs: string
  internalMonitoring: string
  sessionReplay: string
}

export async function buildRum(endpoints: Endpoints) {
  return replaceEndpoints(await readFile(RUM_BUNDLE), endpoints)
}

export async function buildRumSlim(endpoints: Endpoints) {
  return replaceEndpoints(await readFile(RUM_SLIM_BUNDLE), endpoints)
}

export async function buildRumRecorder(endpoints: Endpoints) {
  return replaceEndpoints(await readFile(RUM_RECORDER_BUNDLE), endpoints)
}

export async function buildLogs(endpoints: Endpoints) {
  return replaceEndpoints(await readFile(LOGS_BUNDLE), endpoints)
}

export async function buildNpm(endpoints: Endpoints) {
  return replaceEndpoints(await readFile(NPM_BUNDLE), endpoints)
}

function replaceEndpoints(content: Buffer, endpoints: Endpoints) {
  return bufferReplace(content, {
    '<<< E2E INTERNAL MONITORING ENDPOINT >>>': endpoints.internalMonitoring,
    '<<< E2E LOGS ENDPOINT >>>': endpoints.logs,
    '<<< E2E RUM ENDPOINT >>>': endpoints.rum,
    '<<< E2E SESSION REPLAY ENDPOINT >>>': endpoints.sessionReplay,
  })
}

function bufferReplace(buffer: Buffer, replacements: { [placeholder: string]: string }): Buffer {
  const replacementsArray = Object.entries(replacements).map(([placeholder, replacement]) => [
    Buffer.from(placeholder),
    Buffer.from(replacement),
  ])

  const parts = []
  let lastIndex = 0
  for (let index = 0; index < buffer.length; index += 1) {
    const found = replacementsArray.find(([placeholder]) =>
      buffer.slice(index, index + placeholder.length).equals(placeholder)
    )
    if (found) {
      parts.push(buffer.slice(lastIndex, index), found[1])
      index += found[0].length
      lastIndex = index
    }
  }
  parts.push(buffer.slice(lastIndex))
  return Buffer.concat(parts)
}
