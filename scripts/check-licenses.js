'use strict'

const fs = require('fs')
const path = require('path')
const readline = require('readline')
const { printLog, printError, logAndExit, generateMetadataForAllNodePackages } = require('./utils')

const LICENSE_FILE = 'LICENSE-3rdparty.csv'

async function main() {
  const packages = await generateMetadataForAllNodePackages()

  printLog(
    'Looking for dependencies in:\n',
    packages.map((pkg) => pkg.relativePath),
    '\n'
  )
  const declaredDependencies = withoutDuplicates(packages.flatMap(retrievePackageDependencies)).sort()

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

function retrievePackageDependencies(pkg) {
  return Object.keys(pkg.manifest.dependencies || {})
    .concat(Object.keys(pkg.manifest.devDependencies || {}))
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
