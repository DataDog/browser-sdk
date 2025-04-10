'use strict'

const { version: releaseVersion } = require('../../lerna.json')
const { printLog, runMain } = require('../lib/executionUtils')
const { command } = require('../lib/command')
const { findBrowserSdkPackageJsonFiles } = require('../lib/filesUtils')

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
        !dependencyVersion.startsWith('workspace:') &&
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

function isBrowserSdkPublicPackageName(name) {
  return name?.startsWith('@datadog/')
}
