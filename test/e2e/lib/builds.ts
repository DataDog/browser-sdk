import * as fs from 'fs'
import * as path from 'path'
import { promisify } from 'util'

const readFile = promisify(fs.readFile)

const ROOT = path.join(__dirname, '../../..')
const RUM_BUNDLE = path.join(ROOT, 'packages/rum/bundle/datadog-rum.js')
const LOGS_BUNDLE = path.join(ROOT, 'packages/logs/bundle/datadog-logs.js')
const APP_BUNDLE = path.join(ROOT, 'test/app/dist/app.js')

export interface Endpoints {
  rum: string
  logs: string
  internalMonitoring: string
}

export async function buildRum(endpoints: Endpoints) {
  return replaceEndpoints(await readFile(RUM_BUNDLE), endpoints)
}

export async function buildLogs(endpoints: Endpoints) {
  return replaceEndpoints(await readFile(LOGS_BUNDLE), endpoints)
}

export async function buildApp(endpoints: Endpoints) {
  return replaceEndpoints(await readFile(APP_BUNDLE), endpoints)
}

function replaceEndpoints(content: Buffer, endpoints: Endpoints) {
  return bufferReplace(content, {
    '<<< E2E INTERNAL MONITORING ENDPOINT >>>': endpoints.internalMonitoring,
    '<<< E2E LOGS ENDPOINT >>>': endpoints.logs,
    '<<< E2E RUM ENDPOINT >>>': endpoints.rum,
  })
}

function bufferReplace(buffer: Buffer, replacements: { [needle: string]: string }): Buffer {
  const replacementsArray = Object.entries(replacements).map(([needle, replacement]) => [
    Buffer.from(needle),
    Buffer.from(replacement),
  ])

  const parts = []
  let lastIndex = 0
  for (let index = 0; index < buffer.length; index += 1) {
    const found = replacementsArray.find(([needle, _]) => buffer.slice(index, index + needle.length).equals(needle))
    if (found) {
      parts.push(buffer.slice(lastIndex, index), found[1])
      index += found[0].length
      lastIndex = index
    }
  }
  parts.push(buffer.slice(lastIndex))
  return Buffer.concat(parts)
}
