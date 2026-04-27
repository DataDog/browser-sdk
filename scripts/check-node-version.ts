import * as fs from 'node:fs'
import * as readline from 'node:readline'
import * as path from 'node:path'
import packageJson from '../package.json' with { type: 'json' }
import { printLog, printError, runMain } from './lib/executionUtils.ts'

runMain(async () => {
  printLog('Check that node version across configurations are matching...\n')

  const dockerVersion = await retrieveDockerVersion()
  printLog(`docker: ${dockerVersion}`)

  const voltaVersion = packageJson.volta.node
  printLog(`volta: ${voltaVersion}`)

  const processVersion = retrieveProcessVersion()
  printLog(`process: ${processVersion}`)

  if (dockerVersion !== voltaVersion || dockerVersion !== processVersion) {
    printError('Different node versions detected!\n')
    printError('Ensure to:')
    printError(`- run \`volta pin node@${dockerVersion}\``)
    printError('- bump `CURRENT_CI_IMAGE` and run `ci-image` gitlab job\n')
    process.exit(1)
  }
})

async function retrieveDockerVersion(): Promise<string> {
  const fileStream = fs.createReadStream(path.join(import.meta.dirname, '..', 'Dockerfile'))
  const rl = readline.createInterface({ input: fileStream })
  for await (const line of rl) {
    // node image on first line
    return extractVersion(line)
  }
  throw new Error('Could not find node version in Dockerfile')
}

function retrieveProcessVersion(): string {
  // process.version returns vX.Y.Z
  return extractVersion(process.version)
}

function extractVersion(input: string): string {
  const match = /\d+\.\d+\.\d+/.exec(input)
  if (!match) {
    throw new Error(`Could not extract version from: ${input}`)
  }
  return match[0]
}
