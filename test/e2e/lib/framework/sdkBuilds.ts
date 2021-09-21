import * as fs from 'fs'
import * as path from 'path'
import { promisify } from 'util'

const readFile = promisify(fs.readFile)

const ROOT = path.join(__dirname, '../../../..')
const RUM_BUNDLE = path.join(ROOT, 'packages/rum/bundle/datadog-rum.js')
const RUM_SLIM_BUNDLE = path.join(ROOT, 'packages/rum-slim/bundle/datadog-rum-slim.js')
const LOGS_BUNDLE = path.join(ROOT, 'packages/logs/bundle/datadog-logs.js')
const NPM_BUNDLE = path.join(ROOT, 'test/app/dist/app.js')

export async function buildRum(intakeUrl: string) {
  return replaceEndpoints(await readFile(RUM_BUNDLE), intakeUrl)
}

export async function buildRumSlim(intakeUrl: string) {
  return replaceEndpoints(await readFile(RUM_SLIM_BUNDLE), intakeUrl)
}

export async function buildLogs(intakeUrl: string) {
  return replaceEndpoints(await readFile(LOGS_BUNDLE), intakeUrl)
}

export async function buildNpm(intakeUrl: string) {
  return replaceEndpoints(await readFile(NPM_BUNDLE), intakeUrl)
}

function replaceEndpoints(content: Buffer, intakeUrl: string) {
  return bufferReplace(content, {
    '<<< E2E INTERNAL MONITORING ENDPOINT >>>': `${intakeUrl}/v1/input/internalMonitoring`,
    '<<< E2E LOGS ENDPOINT >>>': `${intakeUrl}/v1/input/logs`,
    '<<< E2E RUM ENDPOINT >>>': `${intakeUrl}/v1/input/rum`,
    '<<< E2E SESSION REPLAY ENDPOINT >>>': `${intakeUrl}/v1/input/sessionReplay`,
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
