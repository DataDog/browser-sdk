'use strict'

const fs = require('fs')
const path = require('path')
const readline = require('readline')
const { printLog, printError, runMain } = require('./lib/executionUtils')
const { findBrowserSdkPackageJsonFiles } = require('./lib/filesUtils')

const LICENSE_FILE = 'LICENSE-3rdparty.csv'

runMain(async () => {
  const packageJsonFiles = findBrowserSdkPackageJsonFiles()

  printLog(
    'Looking for dependencies in:\n',
    packageJsonFiles.map((packageJsonFile) => packageJsonFile.relativePath),
    '\n'
  )
  const declaredDependencies = withoutDuplicates(packageJsonFiles.flatMap(retrievePackageDependencies)).sort()
  const declaredLicenses = (await retrieveLicenses()).sort()

  const missingInLicense = declaredDependencies.filter((d) => !declaredLicenses.includes(d))
  const missingInPackageJson = declaredLicenses.filter((d) => !declaredDependencies.includes(d))

  if (missingInLicense.length === 0 && missingInPackageJson.length === 0) {
    printLog('No missing dependencies found. Dependencies check done.')
    return
  }

  printError(`Package.json dependencies and ${LICENSE_FILE} mismatch`)
  if (missingInLicense.length > 0) {
    printError(`In package.json but not in ${LICENSE_FILE}:\n`, missingInLicense)
  }
  if (missingInPackageJson.length > 0) {
    printError(`In ${LICENSE_FILE} but not in package.json:\n`, missingInPackageJson)
  }
  throw new Error('Dependencies mismatch')
})

function retrievePackageDependencies(packageJsonFile) {
  return Object.entries(packageJsonFile.content.dependencies || {})
    .concat(Object.entries(packageJsonFile.content.devDependencies || {}))
    .map(([dependency, version]) => {
      if (version.startsWith('npm:')) {
        // Extract the original dependency name from the npm protocol version string. Example:
        // npm:react@17  ->  react
        return version.slice(4).split('@')[0]
      }
      return dependency
    })
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
