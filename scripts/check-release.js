'use strict'

const fs = require('fs')
const path = require('path')
const { version: releaseVersion } = require('../lerna.json')
const { generateMetadataForAllNodePackages, printLog, logAndExit, executeCommand } = require('./utils')

async function main() {
  await checkGitTag()
  await checkPackages()

  printLog('Release check done.')
}

async function checkGitTag() {
  printLog('Checking git tag')
  const headRef = await executeCommand('git rev-parse HEAD')
  let tagRef
  try {
    tagRef = await executeCommand(`git rev-list -n 1 v${releaseVersion} --`)
  } catch (error) {
    throw new Error(`Failed to find git tag reference: ${error}`)
  }
  if (tagRef !== headRef) {
    throw new Error('Git tag not on HEAD')
  }
}

async function checkPackages() {
  const packages = await generateMetadataForAllNodePackages()

  printLog(
    `Checking packages:
   - ${packages.map((pkg) => pkg.relativePath).join('\n   - ')}
`
  )

  for (const pkg of packages) {
    checkPackage(pkg)
  }
}

function checkPackage(pkg) {
  if (isBrowserSdkPackageName(pkg.manifest.name) && pkg.manifest.version !== releaseVersion) {
    throw new Error(`Invalid version for ${pkg.relativePath}: expected ${releaseVersion}, got ${pkg.manifest.version}`)
  }
  checkPackageDependencyVersions(pkg)
  checkPackageEntryPoints(pkg)
}

function checkPackageDependencyVersions(pkg) {
  for (const dependencies of [pkg.manifest.dependencies, pkg.manifest.devDependencies, pkg.manifest.peerDependencies]) {
    if (!dependencies) {
      continue
    }

    for (const [dependencyName, dependencyVersion] of Object.entries(dependencies)) {
      if (
        isBrowserSdkPackageName(dependencyName) &&
        !dependencyVersion.startsWith('file:') &&
        dependencyVersion !== releaseVersion
      ) {
        throw new Error(
          `Invalid dependency version for ${dependencyName} in ${pkg.relativePath}: expected ${releaseVersion}, got ${dependencyVersion}`
        )
      }
    }
  }
}

function checkPackageEntryPoints(pkg) {
  for (const entryPointPath of [pkg.manifest.main, pkg.manifest.module, pkg.manifest.types]) {
    if (!entryPointPath) {
      continue
    }

    const absoluteEntryPointPath = path.resolve(pkg.path, entryPointPath)
    if (!fs.existsSync(absoluteEntryPointPath)) {
      throw new Error(
        `Invalid entry point ${entryPointPath} in ${pkg.relativePath}: ${absoluteEntryPointPath} not found`
      )
    }
  }
}

function isBrowserSdkPackageName(name) {
  return name?.startsWith('@datadog/')
}

main().catch(logAndExit)
