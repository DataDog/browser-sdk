'use strict'

const fs = require('fs')
const path = require('path')
const { version: releaseVersion } = require('../../lerna.json')
const { printLog, runMain } = require('../lib/execution-utils')
const { command } = require('../lib/command')
const { findBrowserSdkPackageJsonFiles } = require('../lib/files-utils')

runMain(() => {
  checkGitTag()
  checkBrowserSdkPackageJsonFiles()

  printLog('Release check done.')
})

function checkGitTag() {
  printLog('Checking release version tag is on HEAD')
  const headRef = command`git rev-parse HEAD`.run()
  let tagRef
  try {
    tagRef = command`git rev-list -n 1 v${releaseVersion} --`.run()
  } catch (error) {
    throw new Error(`Failed to find git tag reference: ${error}`)
  }
  if (tagRef !== headRef) {
    throw new Error('Git tag not on HEAD')
  }
}

function checkBrowserSdkPackageJsonFiles() {
  const packageJsonFiles = findBrowserSdkPackageJsonFiles()

  printLog(
    `Checking package.json files:
   - ${packageJsonFiles.map((packageJsonFile) => packageJsonFile.relativePath).join('\n   - ')}
`
  )

  for (const packageJsonFile of packageJsonFiles) {
    checkPackageJsonVersion(packageJsonFile)
    checkPackageDependencyVersions(packageJsonFile)
    checkPackageJsonEntryPoints(packageJsonFile)
  }
}

function checkPackageJsonVersion(packageJsonFile) {
  if (
    isBrowserSdkPublicPackageName(packageJsonFile.content.name) &&
    packageJsonFile.content.version !== releaseVersion
  ) {
    throw new Error(
      `Invalid version for ${packageJsonFile.relativePath}: expected ${releaseVersion}, got ${packageJsonFile.content.version}`
    )
  }
}

function checkPackageDependencyVersions(packageJsonFile) {
  for (const dependencies of [
    packageJsonFile.content.dependencies,
    packageJsonFile.content.devDependencies,
    packageJsonFile.content.peerDependencies,
  ]) {
    if (!dependencies) {
      continue
    }

    for (const [dependencyName, dependencyVersion] of Object.entries(dependencies)) {
      if (
        isBrowserSdkPublicPackageName(dependencyName) &&
        !dependencyVersion.startsWith('file:') &&
        dependencyVersion !== releaseVersion
      ) {
        throw new Error(
          `Invalid dependency version for ${dependencyName} in ${packageJsonFile.relativePath}: expected ${releaseVersion}, got ${dependencyVersion}`
        )
      }
    }
  }
}

function checkPackageJsonEntryPoints(packageJsonFile) {
  for (const entryPointPath of [
    packageJsonFile.content.main,
    packageJsonFile.content.module,
    packageJsonFile.content.types,
  ]) {
    if (!entryPointPath) {
      continue
    }

    const absoluteEntryPointPath = path.resolve(path.dirname(packageJsonFile.path), entryPointPath)
    if (!fs.existsSync(absoluteEntryPointPath)) {
      throw new Error(
        `Invalid entry point ${entryPointPath} in ${packageJsonFile.relativePath}: ${absoluteEntryPointPath} not found`
      )
    }
  }
}

function isBrowserSdkPublicPackageName(name) {
  return name?.startsWith('@datadog/')
}
