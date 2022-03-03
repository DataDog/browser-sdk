'use strict'

const fs = require('fs')
const path = require('path')
const readline = require('readline')
const { executeCommand, printLog, printError, logAndExit } = require('./utils')

const LICENSE_FILE = 'LICENSE-3rdparty.csv'

async function main() {
  const packageJsonPaths = await findPackageJsonPaths()

  printLog('Looking for dependencies in:\n', packageJsonPaths, '\n')
  const declaredDependencies = withoutDuplicates(packageJsonPaths.flatMap(retrievePackageJsonDependencies)).sort()

  const declaredLicenses = (await retrieveLicenses()).sort()

  if (JSON.stringify(declaredDependencies) !== JSON.stringify(declaredLicenses)) {
    printError(`Package.json dependencies and ${LICENSE_FILE} mismatch`)
    printError(
      `In package.json but not in ${LICENSE_FILE}:\n`,
      declaredDependencies.filter((d) => !declaredLicenses.includes(d))
    )
    printError(
      `In ${LICENSE_FILE} but not in package.json:\n`,
      declaredLicenses.filter((d) => !declaredDependencies.includes(d))
    )
    throw new Error('Dependencies mismatch')
  }
  printLog('Dependencies check done.')
}

async function findPackageJsonPaths() {
  const paths = await executeCommand('find . -path "*/node_modules/*" -prune -o -name "package.json" -print')
  return paths.trim().split('\n')
}

function retrievePackageJsonDependencies(packageJsonPath) {
  const packageJson = require(path.join(__dirname, '..', packageJsonPath))

  return Object.keys(packageJson.dependencies || {})
    .concat(Object.keys(packageJson.devDependencies || {}))
    .filter((dependency) => !dependency.includes('@datadog'))
}

function withoutDuplicates(a) {
  return [...new Set(a)]
}

async function retrieveLicenses() {
  const fileStream = fs.createReadStream(path.join(__dirname, '..', LICENSE_FILE))
  const rl = readline.createInterface({ input: fileStream })
  const licenses = []
  let header = true
  for await (const line of rl) {
    const csvColumns = line.split(',')
    if (!header && csvColumns[0] !== 'file') {
      licenses.push(csvColumns[1])
    }
    header = false
  }
  return licenses
}

main().catch(logAndExit)
