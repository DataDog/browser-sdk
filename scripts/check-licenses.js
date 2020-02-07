'use strict'

const fs = require('fs')
const path = require('path')
const readline = require('readline')
const util = require('util')
const exec = util.promisify(require('child_process').exec)

const LICENSE_FILE = 'LICENSE-3rdparty.csv'

async function main() {
  const packageJsonPaths = await findPackageJsonPaths()

  console.log(`Look for dependencies in:\n`, packageJsonPaths)
  const declaredDependencies = packageJsonPaths
    .map(retrievePackageJsonDependencies)
    .reduce(withoutDuplicates)
    .sort()

  const declaredLicenses = (await retrieveLicenses()).sort()

  if (JSON.stringify(declaredDependencies) !== JSON.stringify(declaredLicenses)) {
    console.error(`\n❌ package.json dependencies and ${LICENSE_FILE} mismatch`)
    console.error(
      `\nIn package.json but not in ${LICENSE_FILE}:\n`,
      declaredDependencies.filter((d) => !declaredLicenses.includes(d))
    )
    console.error(
      `\nIn ${LICENSE_FILE} but not in package.json:\n`,
      declaredLicenses.filter((d) => !declaredDependencies.includes(d))
    )
    throw new Error()
  }
  console.log(`\n✅ All dependencies listed in ${LICENSE_FILE}`)
}

async function findPackageJsonPaths() {
  const { stdout } = await exec('find . -name "package.json" | grep -v node_modules')
  return stdout.trim().split('\n')
}

function retrievePackageJsonDependencies(packageJsonPath) {
  const packageJson = require(path.join(__dirname, '..', packageJsonPath))

  return Object.keys(packageJson.dependencies || {})
    .concat(Object.keys(packageJson.devDependencies || {}))
    .filter((dependency) => !dependency.includes('@datadog'))
}

function withoutDuplicates(a, b) {
  return [...new Set([...a, ...b])]
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

main().catch(() => {
  process.exit(1)
})
