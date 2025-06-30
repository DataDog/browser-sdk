const fs = require('fs')
const readline = require('readline')
const path = require('path')
const packageJson = require('../package.json')
const { printLog, printError, runMain } = require('./lib/executionUtils')
const { command } = require('./lib/command')

runMain(async () => {
  printLog('Check that node version across configurations are matching...\n')

  const dockerVersion = await retrieveDockerVersion()
  printLog(`docker: ${dockerVersion}`)

  const voltaVersion = packageJson.volta.node
  printLog(`volta: ${voltaVersion}`)

  const cliVersion = retrieveCliVersion()
  printLog(`cli: ${cliVersion}`)

  if (dockerVersion !== voltaVersion || dockerVersion !== cliVersion) {
    printError('Different node versions detected!\n')
    printError('Ensure to:')
    printError(`- run \`volta pin node@${dockerVersion}\``)
    printError('- bump `CURRENT_CI_IMAGE` and run `ci-image` gitlab job\n')
    process.exit(1)
  }
})

async function retrieveDockerVersion() {
  const fileStream = fs.createReadStream(path.join(__dirname, '..', 'Dockerfile'))
  const rl = readline.createInterface({ input: fileStream })
  for await (const line of rl) {
    // node image on first line
    return extractVersion(line)
  }
}

function retrieveCliVersion() {
  // node cli returns vX.Y.Z
  return extractVersion(command`node -v`.run())
}

function extractVersion(input) {
  return /\d+\.\d+\.\d+/.exec(input)[0]
}
