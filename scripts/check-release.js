'use strict'

const fs = require('fs')
const path = require('path')
const { version: releaseVersion } = require('../lerna.json')
const { findBrowserSdkPackageJsonFiles, printLog, runMain, executeCommand } = require('./utils')

runMain(async () => {
  await checkGitTag()
  await checkBrowserSdkPackageJsonFiles()

  printLog('Release check done.')
})

async function checkGitTag() {
  printLog('Checking release version tag is on HEAD')
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

async function checkBrowserSdkPackageJsonFiles() {
  const packageJsonFiles = await findBrowserSdkPackageJsonFiles()

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
