import { releaseVersion } from './browserSdkVersion.ts'
import { printLog } from './executionUtils.ts'
import type { PackageJsonInfo } from './filesUtils.ts'
import {
  findPackageJsonFiles,
  isBrowserSdkPackageName,
  isIndependentlyVersionedPackage,
  isSemanticVersion,
} from './filesUtils.ts'

export function checkPackageJsonFiles(): void {
  const packageJsonFiles = findPackageJsonFiles()

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
function checkPackageJsonVersion(packageJsonInfo: PackageJsonInfo): void {
  if (packageJsonInfo.content.private) {
    // The developer extension is a private package, but it should still have a version
    if (
      packageJsonInfo.content.version &&
      packageJsonInfo.content.name !== '@datadog/browser-sdk-developer-extension' &&
      packageJsonInfo.relativePath !== 'package.json'
    ) {
      throw new Error(`Private package ${packageJsonInfo.relativePath} should not have a version`)
    }
  } else if (isIndependentlyVersionedPackage(packageJsonInfo.content.name)) {
    // Independently-versioned packages are published as part of the same release but keep their
    // own version, so we only require a valid semver, not a match with the synced release version.
    if (!isSemanticVersion(packageJsonInfo.content.version)) {
      throw new Error(
        `Invalid version for ${packageJsonInfo.relativePath}: expected a semantic version, got ${packageJsonInfo.content.version}`
      )
    }
  } else if (packageJsonInfo.content.version !== releaseVersion) {
    throw new Error(
      `Invalid version for ${packageJsonInfo.relativePath}: expected ${releaseVersion}, got ${packageJsonInfo.content.version}`
    )
  }
}
function checkPackageDependencyVersions(packageJsonInfo: PackageJsonInfo): void {
  if (packageJsonInfo.content.private) {
    return
  }

  for (const dependencies of [
    packageJsonInfo.content.dependencies,
    packageJsonInfo.content.devDependencies,
    packageJsonInfo.content.peerDependencies,
  ]) {
    if (!dependencies) {
      continue
    }

    for (const [dependencyName, dependencyVersion] of Object.entries(dependencies)) {
      // Internal Browser SDK packages are resolved from the monorepo workspaces, so dependents must
      // reference them with the `workspace:` protocol instead of a hardcoded version. Yarn rewrites
      // `workspace:*` to the resolved concrete version at publish time.
      if (isBrowserSdkPackageName(dependencyName) && dependencyVersion !== 'workspace:*') {
        throw new Error(
          `Invalid dependency version for ${dependencyName} in ${packageJsonInfo.relativePath}: expected workspace:*, got ${dependencyVersion}`
        )
      }
    }
  }
}
