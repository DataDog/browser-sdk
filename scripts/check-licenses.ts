import * as fs from 'node:fs'
import * as path from 'node:path'
import * as readline from 'node:readline'
import { printLog, printError, runMain } from './lib/executionUtils.ts'
import { findBrowserSdkPackageJsonFiles } from './lib/filesUtils.ts'

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
})

function retrievePackageDependencies(packageJsonFile: { content: any }): string[] {
  return Object.entries(packageJsonFile.content.dependencies || {})
    .concat(Object.entries(packageJsonFile.content.devDependencies || {}))
    .map(([dependency, version]) => {
      if (typeof version === 'string' && version.startsWith('npm:')) {
        // Extract the original dependency name from the npm protocol version string. Example:
        // npm:react@17  ->  react
        return version.slice(4).split('@')[0]
      }
      return dependency
    })
    .filter((dependency) => !dependency.includes('@datadog'))
}

function withoutDuplicates<T>(a: T[]): T[] {
  return [...new Set(a)]
}

async function retrieveLicenses(): Promise<string[]> {
  const fileStream = fs.createReadStream(path.join(import.meta.dirname, '..', LICENSE_FILE))
  const rl = readline.createInterface({ input: fileStream })
  const licenses: string[] = []
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
